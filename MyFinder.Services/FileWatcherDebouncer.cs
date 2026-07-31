using System.Collections.Concurrent;
using MyFinder.Core.Interfaces;
using MyFinder.Models.Entities;

namespace MyFinder.Services;

public class FileWatcherDebouncer : IDisposable
{
    private readonly ConcurrentDictionary<string, Timer> _timers = new();
    private readonly TimeSpan _debounceDelay;
    private readonly Action<FileRecord> _onFileChanged;
    private readonly ISecurityAuditLogger _logger;
    private bool _disposed;

    public FileWatcherDebouncer(TimeSpan debounceDelay, Action<FileRecord> onFileChanged, ISecurityAuditLogger logger)
    {
        _debounceDelay = debounceDelay;
        _onFileChanged = onFileChanged ?? throw new ArgumentNullException(nameof(onFileChanged));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    public void Trigger(FileRecord record)
    {
        if (_disposed) return;

        var key = record.Path;
        _timers.AddOrUpdate(key,
            _ => new Timer(OnTimerCallback, record, _debounceDelay, Timeout.InfiniteTimeSpan),
            (_, existingTimer) =>
            {
                existingTimer.Change(_debounceDelay, Timeout.InfiniteTimeSpan);
                return existingTimer;
            });
    }

    private void OnTimerCallback(object? state)
    {
        if (_disposed || state is not FileRecord record) return;

        try
        {
            if (_timers.TryRemove(record.Path, out var timer))
            {
                timer.Dispose();
                _onFileChanged.Invoke(record);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError("DEBOUNCER_ERROR", $"Debounce callback failed: {ex.Message}");
        }
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        foreach (var timer in _timers.Values)
        {
            timer.Dispose();
        }
        _timers.Clear();
        GC.SuppressFinalize(this);
    }
}
