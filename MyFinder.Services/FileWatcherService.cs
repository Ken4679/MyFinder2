using System.Collections.Concurrent;
using System.IO;
using MyFinder.Core.Interfaces;
using MyFinder.Models.Entities;
using MyFinder.Models.Helpers;

namespace MyFinder.Services;

public class FileWatcherService : IFileWatcherService
{
    private readonly ConcurrentDictionary<string, FileSystemWatcher> _watchers = new();
    private readonly List<string> _watchedPaths = new();
    private readonly object _lock = new();
    private readonly ISecurityAuditLogger _logger;
    private FileWatcherDebouncer? _debouncer;
    private bool _disposed;

    public IReadOnlyList<string> WatchedPaths
    {
        get
        {
            lock (_lock)
                return _watchedPaths.AsReadOnly();
        }
    }

    public event EventHandler<FileRecord>? FileCreated;
    public event EventHandler<FileRecord>? FileChanged;
    public event EventHandler<string>? FileDeleted;
    public event EventHandler<(string OldPath, string NewPath)>? FileRenamed;

    public FileWatcherService(ISecurityAuditLogger logger)
    {
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        _debouncer = new FileWatcherDebouncer(
            TimeSpan.FromMilliseconds(300),
            OnDebouncedFileChanged,
            _logger);
    }

    private void OnDebouncedFileChanged(FileRecord record)
    {
        FileChanged?.Invoke(this, record);
    }

    public void AddWatchPath(string path)
    {
        if (string.IsNullOrWhiteSpace(path) || !Directory.Exists(path))
        {
            _logger.LogError("WATCHER_ADD_INVALID", $"Missing directory for watcher: {path}");
            return;
        }

        var normalizedPath = Path.GetFullPath(path).TrimEnd(Path.DirectorySeparatorChar);

        lock (_lock)
        {
            if (_watchedPaths.Any(w => normalizedPath.Equals(w, StringComparison.OrdinalIgnoreCase) || 
                                       normalizedPath.StartsWith(w + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)))
            {
                _logger.LogSecurityEvent("WATCHER_SKIPPED", $"Path already covered by watcher: {normalizedPath}");
                return;
            }
        }

        try
        {
            var watcher = new FileSystemWatcher
            {
                Path = normalizedPath,
                IncludeSubdirectories = true,
                NotifyFilter = NotifyFilters.FileName | NotifyFilters.LastWrite | NotifyFilters.CreationTime | NotifyFilters.DirectoryName,
                Filter = "*.*",
                InternalBufferSize = 64 * 1024,
                EnableRaisingEvents = true
            };

            watcher.Created += OnCreated;
            watcher.Changed += OnChanged;
            watcher.Deleted += OnDeleted;
            watcher.Renamed += OnRenamed;
            watcher.Error += OnError;

            if (_watchers.TryAdd(normalizedPath, watcher))
            {
                lock (_lock)
                {
                    if (!_watchedPaths.Contains(normalizedPath))
                        _watchedPaths.Add(normalizedPath);
                }
                _logger.LogSecurityEvent("WATCHER_ADD", $"Added watch on: {normalizedPath}");
            }
        }
        catch (Exception ex)
        {
            _logger.LogError("WATCHER_ADD_ERROR", $"Failed to watch {normalizedPath}: {ex.Message}");
        }
    }

    public void RemoveWatchPath(string path)
    {
        if (string.IsNullOrWhiteSpace(path)) return;
        var normalizedPath = Path.GetFullPath(path).TrimEnd(Path.DirectorySeparatorChar);

        if (_watchers.TryRemove(normalizedPath, out var watcher))
        {
            watcher.Created -= OnCreated;
            watcher.Changed -= OnChanged;
            watcher.Deleted -= OnDeleted;
            watcher.Renamed -= OnRenamed;
            watcher.Error -= OnError;
            watcher.EnableRaisingEvents = false;
            watcher.Dispose();

            lock (_lock)
                _watchedPaths.Remove(normalizedPath);

            _logger.LogSecurityEvent("WATCHER_REMOVE", $"Removed watch on: {normalizedPath}");
        }
    }

    public void StartAll()
    {
        foreach (var watcher in _watchers.Values)
        {
            try { watcher.EnableRaisingEvents = true; } catch { }
        }
        _logger.LogSecurityEvent("WATCHER_START_ALL", $"All watchers started ({_watchers.Count} directories).");
    }

    public void StopAll()
    {
        foreach (var watcher in _watchers.Values)
        {
            try { watcher.EnableRaisingEvents = false; } catch { }
        }
        _logger.LogSecurityEvent("WATCHER_STOP_ALL", "All watchers stopped.");
    }

    public bool IsWatching(string path)
    {
        if (string.IsNullOrEmpty(path)) return false;
        var normalized = Path.GetFullPath(path).TrimEnd(Path.DirectorySeparatorChar);
        return _watchers.ContainsKey(normalized);
    }

    private void OnCreated(object sender, FileSystemEventArgs e)
    {
        if (e.ChangeType != WatcherChangeTypes.Created || !File.Exists(e.FullPath))
            return;

        _ = ProcessFileWithRetryAsync(e.FullPath);
    }

    private async Task ProcessFileWithRetryAsync(string filePath)
    {
        await RetryHelper.RetryAsync(async () =>
        {
            if (!File.Exists(filePath)) return;
            var info = new FileInfo(filePath);
            var record = new FileRecord
            {
                Path = info.FullName,
                FileName = info.Name,
                Extension = info.Extension.ToLowerInvariant(),
                SizeBytes = info.Length,
                Category = FileCategoryHelper.DetermineCategory(info.Extension),
                CreatedTime = info.CreationTimeUtc,
                UpdatedTime = info.LastWriteTimeUtc
            };
            FileCreated?.Invoke(this, record);
        }, maxRetries: 3, initialDelay: TimeSpan.FromMilliseconds(200), _logger);
    }

    private void OnChanged(object sender, FileSystemEventArgs e)
    {
        if (e.ChangeType != WatcherChangeTypes.Changed || !File.Exists(e.FullPath))
            return;

        try
        {
            var info = new FileInfo(e.FullPath);
            var record = new FileRecord
            {
                Path = info.FullName,
                FileName = info.Name,
                Extension = info.Extension.ToLowerInvariant(),
                SizeBytes = info.Length,
                Category = FileCategoryHelper.DetermineCategory(info.Extension),
                CreatedTime = info.CreationTimeUtc,
                UpdatedTime = info.LastWriteTimeUtc
            };
            _debouncer?.Trigger(record);
        }
        catch (Exception ex)
        {
            _logger.LogError("WATCHER_CHANGE_ERROR", $"Error on changed: {ex.Message}");
        }
    }

    private void OnDeleted(object sender, FileSystemEventArgs e)
    {
        FileDeleted?.Invoke(this, e.FullPath);
    }

    private void OnRenamed(object sender, RenamedEventArgs e)
    {
        FileRenamed?.Invoke(this, (e.OldFullPath, e.FullPath));
    }

    private void OnError(object sender, ErrorEventArgs e)
    {
        _logger.LogError("WATCHER_ERROR", $"FileSystemWatcher error: {e.GetException()?.Message}");
    }

    public void Dispose()
    {
        if (_disposed) return;
        StopAll();
        foreach (var kv in _watchers)
        {
            kv.Value.Created -= OnCreated;
            kv.Value.Changed -= OnChanged;
            kv.Value.Deleted -= OnDeleted;
            kv.Value.Renamed -= OnRenamed;
            kv.Value.Error -= OnError;
            kv.Value.Dispose();
        }
        _watchers.Clear();
        lock (_lock)
            _watchedPaths.Clear();
        _debouncer?.Dispose();
        _disposed = true;
        GC.SuppressFinalize(this);
    }
}