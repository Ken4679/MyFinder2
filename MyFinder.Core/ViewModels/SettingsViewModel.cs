using System.Collections.ObjectModel;
using System.IO;
using System.Text.Json;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using MyFinder.Core.Interfaces;
using MyFinder.Core.Interfaces.Repositories;
using MyFinder.Models.Entities;
using MyFinder.Models.Enums;
using MyFinder.Models.Helpers;

namespace MyFinder.Core.ViewModels;

public partial class SettingsViewModel : BaseViewModel, IDisposable
{
    private readonly IThemeService _themeService;
    private readonly IDatabaseContext _databaseContext;
    private readonly IFileScanner _fileScanner;
    private readonly ISecurityAuditLogger _logger;
    private readonly IFileWatcherService _fileWatcherService;
    private readonly IFileRepository _fileRepository;
    private readonly IPathProvider _pathProvider;
    private readonly IDialogService _dialogService;
    private readonly IStartupService _startupService;

    private bool _isInitializingSettings = true;

    [ObservableProperty]
    private bool _autoStartEnabled;

    [ObservableProperty]
    private bool _minimizeToTrayEnabled;

    [ObservableProperty]
    private int _closeButtonAction;

    [ObservableProperty]
    private bool _autoIndexOnStartup = true;

    [ObservableProperty]
    private bool _portableModeEnabled;

    // ===== 新增：AI 模式开关 =====
    [ObservableProperty]
    private bool _isAiModeEnabled;

    public string DataFolderPath => _pathProvider.GetDataRootDirectory();
    public string LogFolderPath => _pathProvider.GetLogDirectory();
    public string AppDirectoryPath => AppDomain.CurrentDomain.BaseDirectory;

    [ObservableProperty]
    private ElementThemeMode _currentTheme;

    [ObservableProperty]
    private bool _isIndexing;

    [ObservableProperty]
    private double _indexProgress;

    [ObservableProperty]
    private string _indexStatusText = string.Empty;

    [ObservableProperty]
    private bool _includeSubdirectories = true;

    [ObservableProperty]
    private bool _canCancelIndexing;

    [ObservableProperty]
    private int _processedCount;

    public string ProcessedCountText => $"已完成 {ProcessedCount} 个文件";

    [ObservableProperty]
    private bool _autoStartMonitoring = true;

    public ObservableCollection<string> WatchedDirectories { get; } = new();

    public string DatabaseFilePath => _databaseContext.DbPath;
    private string _appDataTotalSize = "正在计算...";
    private string _lastCalculatedPath = string.Empty;

    public string AppDataTotalSize => _appDataTotalSize;

    private CancellationTokenSource? _cancellationTokenSource;
    private string _settingsFilePath = string.Empty;

    // ===== 新增：静态事件，用于通知其他 ViewModel 监控目录列表发生变化 =====
    public static event EventHandler? WatchedDirectoriesChanged;

    public event EventHandler<string>? FolderBrowseRequested;
    public event EventHandler<string>? IndexFolderBrowseRequested;

    public SettingsViewModel(
        IThemeService themeService,
        IDatabaseContext databaseContext,
        IFileScanner fileScanner,
        ISecurityAuditLogger logger,
        IFileWatcherService fileWatcherService,
        IFileRepository fileRepository,
        IPathProvider pathProvider,
        IDialogService dialogService,
        IStartupService startupService)
    {
        _themeService = themeService ?? throw new ArgumentNullException(nameof(themeService));
        _databaseContext = databaseContext ?? throw new ArgumentNullException(nameof(databaseContext));
        _fileScanner = fileScanner ?? throw new ArgumentNullException(nameof(fileScanner));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        _fileWatcherService = fileWatcherService ?? throw new ArgumentNullException(nameof(fileWatcherService));
        _fileRepository = fileRepository ?? throw new ArgumentNullException(nameof(fileRepository));
        _pathProvider = pathProvider ?? throw new ArgumentNullException(nameof(pathProvider));
        _dialogService = dialogService ?? throw new ArgumentNullException(nameof(dialogService));
        _startupService = startupService ?? throw new ArgumentNullException(nameof(startupService));

        Title = "设置";
        CurrentTheme = _themeService.CurrentTheme;
        _themeService.ThemeChanged += OnThemeChanged;

        LoadSettings();

        AutoStartEnabled = _startupService.IsEnabled();

        _portableModeEnabled = _pathProvider.IsPortableMode;
        OnPropertyChanged(nameof(PortableModeEnabled));

        LoadWatchedDirectories();

        if (WatchedDirectories.Count == 0)
        {
            var defaultPath = Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments);
            if (!string.IsNullOrEmpty(defaultPath) && Directory.Exists(defaultPath))
            {
                AddDirectoryInternal(defaultPath);
            }
        }

        _ = LoadAppDataSizeAsync();

        _fileWatcherService.FileCreated += OnFileCreated;
        _fileWatcherService.FileChanged += OnFileChanged;
        _fileWatcherService.FileDeleted += OnFileDeleted;
        _fileWatcherService.FileRenamed += OnFileRenamed;

        _isInitializingSettings = false;
    }

    private void LoadSettings()
    {
        var appData = _pathProvider.GetDataRootDirectory();
        Directory.CreateDirectory(appData);
        var configFile = Path.Combine(appData, "settings.json");
        if (File.Exists(configFile))
        {
            try
            {
                var json = File.ReadAllText(configFile);
                var settings = JsonSerializer.Deserialize<SettingsData>(json);
                if (settings != null)
                {
                    MinimizeToTrayEnabled = settings.MinimizeToTray;
                    CloseButtonAction = settings.CloseAction;
                    AutoIndexOnStartup = settings.AutoIndex;
                    AutoStartMonitoring = settings.AutoMonitor;
                    IsAiModeEnabled = settings.IsAiModeEnabled; // 新增
                }
            }
            catch (Exception ex)
            {
                _logger.LogError("SETTINGS_LOAD_ERROR", $"Failed to load settings: {ex.Message}");
            }
        }
        _settingsFilePath = configFile;
    }

    private void SaveSettings()
    {
        if (_isInitializingSettings) return;

        try
        {
            if (string.IsNullOrEmpty(_settingsFilePath))
            {
                var appData = _pathProvider.GetDataRootDirectory();
                Directory.CreateDirectory(appData);
                _settingsFilePath = Path.Combine(appData, "settings.json");
            }

            var settings = new SettingsData
            {
                MinimizeToTray = MinimizeToTrayEnabled,
                CloseAction = CloseButtonAction,
                AutoIndex = AutoIndexOnStartup,
                AutoMonitor = AutoStartMonitoring,
                IsAiModeEnabled = IsAiModeEnabled // 新增
            };
            var json = JsonSerializer.Serialize(settings, new JsonSerializerOptions { WriteIndented = true });
            File.WriteAllText(_settingsFilePath, json);
        }
        catch (Exception ex)
        {
            _logger.LogError("SETTINGS_SAVE_ERROR", $"Failed to save settings: {ex.Message}");
        }
    }

    partial void OnAutoStartEnabledChanged(bool value)
    {
        if (_isInitializingSettings) return;
        try
        {
            if (value)
                _startupService.Enable();
            else
                _startupService.Disable();
        }
        catch (Exception ex)
        {
            _logger.LogError("AUTOSTART_ERROR", ex.Message);
            AutoStartEnabled = !value;
        }
    }

    partial void OnMinimizeToTrayEnabledChanged(bool value) => SaveSettings();
    partial void OnCloseButtonActionChanged(int value) => SaveSettings();
    partial void OnAutoIndexOnStartupChanged(bool value) => SaveSettings();
    partial void OnAutoStartMonitoringChanged(bool value) => SaveSettings();

    // ===== 新增：AI 模式改变时自动保存 =====
    partial void OnIsAiModeEnabledChanged(bool value) => SaveSettings();

    private void OnThemeChanged(object? sender, ElementThemeMode mode) => CurrentTheme = mode;

    [RelayCommand]
    private void SetTheme(ElementThemeMode theme)
    {
        _themeService.SetTheme(theme);
        CurrentTheme = theme;
    }

    [RelayCommand]
    private void AddDirectory()
    {
        FolderBrowseRequested?.Invoke(this, string.Empty);
    }

    private void AddDirectoryInternal(string path)
    {
        if (string.IsNullOrEmpty(path) || !Directory.Exists(path)) return;
        var normalized = Path.GetFullPath(path).TrimEnd(Path.DirectorySeparatorChar);
        if (!WatchedDirectories.Contains(normalized))
        {
            WatchedDirectories.Add(normalized);
            _fileWatcherService.AddWatchPath(normalized);
            SaveWatchedDirectories();
            // ===== 触发静态事件 =====
            WatchedDirectoriesChanged?.Invoke(this, EventArgs.Empty);
        }
    }

    public void AddDirectoryFromPicker(string path) => AddDirectoryInternal(path);

    [RelayCommand]
    private async Task StartIndexingAsync()
    {
        if (IsIndexing) return;
        IndexFolderBrowseRequested?.Invoke(this, string.Empty);
        await Task.CompletedTask;
    }

    public async Task StartIndexingOnPath(string path)
    {
        if (IsIndexing) return;
        if (string.IsNullOrEmpty(path) || !Directory.Exists(path))
        {
            IndexStatusText = "请选择有效的索引目录";
            return;
        }

        IsIndexing = true;
        CanCancelIndexing = true;
        IndexProgress = 0;
        ProcessedCount = 0;
        IndexStatusText = "正在准备扫描...";
        _cancellationTokenSource = new CancellationTokenSource();

        try
        {
            var progress = new Progress<(int Percent, string CurrentFile)>(update =>
            {
                IndexProgress = update.Percent;
                if (!string.IsNullOrEmpty(update.CurrentFile))
                {
                    IndexStatusText = update.CurrentFile;
                }
                OnPropertyChanged(nameof(IndexProgress));
                OnPropertyChanged(nameof(IndexStatusText));
            });

            await _fileScanner.ScanDirectoryAsync(
                path,
                _cancellationTokenSource.Token,
                progress,
                IncludeSubdirectories);

            if (_cancellationTokenSource.Token.IsCancellationRequested)
            {
                IndexStatusText = "扫描已取消";
                IndexProgress = 0;
            }
            else
            {
                IndexProgress = 100;
                IndexStatusText = "扫描完成 ✅";
                AddDirectoryInternal(path);
                _logger.LogSecurityEvent("INDEX_COMPLETE", $"Indexed and added to watch: {path}");

                // 索引完成后执行数据库压缩（异步执行，不阻塞 UI）
                _ = Task.Run(async () =>
                {
                    await _databaseContext.VacuumAndCheckpointAsync();
                });
            }
        }
        catch (OperationCanceledException)
        {
            IndexStatusText = "扫描已取消";
            IndexProgress = 0;
        }
        catch (Exception ex)
        {
            IndexStatusText = $"扫描失败: {ex.Message}";
            IndexProgress = 0;
            _logger.LogError("ERR_INDEX_START", ex.Message);
        }
        finally
        {
            IsIndexing = false;
            CanCancelIndexing = false;
            _cancellationTokenSource?.Dispose();
            _cancellationTokenSource = null;
        }
    }

    [RelayCommand]
    private void CancelIndexing()
    {
        if (_cancellationTokenSource != null && !_cancellationTokenSource.IsCancellationRequested)
        {
            _cancellationTokenSource.Cancel();
            IndexStatusText = "正在取消...";
        }
    }

    [RelayCommand]
    private void OpenFolder(string path)
    {
        if (string.IsNullOrEmpty(path)) return;
        try
        {
            if (!Directory.Exists(path))
            {
                var dir = Path.GetDirectoryName(path);
                if (!string.IsNullOrEmpty(dir) && Directory.Exists(dir))
                    path = dir;
                else
                    return;
            }
            System.Diagnostics.Process.Start("explorer.exe", path);
        }
        catch (Exception ex)
        {
            _logger.LogError("OPEN_FOLDER_ERROR", $"Failed to open folder: {ex.Message}");
        }
    }

    // ===== 新增：移除目录命令 =====
    [RelayCommand]
    private async Task RemoveDirectory(string path)
    {
        if (string.IsNullOrEmpty(path)) return;
        var normalized = Path.GetFullPath(path).TrimEnd(Path.DirectorySeparatorChar);

        if (WatchedDirectories.Contains(normalized))
        {
            WatchedDirectories.Remove(normalized);
            _fileWatcherService.RemoveWatchPath(normalized);
            SaveWatchedDirectories();

            // 从数据库中删除该目录下的所有文件（异步）
            _ = Task.Run(async () =>
            {
                try
                {
                    var allFiles = await _fileRepository.GetAllAsync(int.MaxValue);
                    var toDelete = allFiles.Where(f => f.Path.StartsWith(normalized + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)
                                                       || f.Path.Equals(normalized, StringComparison.OrdinalIgnoreCase));
                    foreach (var file in toDelete)
                    {
                        await _fileRepository.DeleteAsync(file.Id);
                    }
                    _logger.LogSecurityEvent("DIRECTORY_REMOVED", $"Removed {toDelete.Count()} files from DB for path: {normalized}");
                }
                catch (Exception ex)
                {
                    _logger.LogError("REMOVE_DIRECTORY_DB_ERROR", $"Failed to delete files for {normalized}: {ex.Message}");
                }
            });

            // 触发事件通知其他 ViewModel
            WatchedDirectoriesChanged?.Invoke(this, EventArgs.Empty);
        }
    }

    private async void OnFileCreated(object? sender, FileRecord record)
    {
        try
        {
            await _fileRepository.AddAsync(record);
        }
        catch (Exception ex)
        {
            _logger.LogError("WATCHER_CREATE_DB_ERROR", $"Failed to add file: {ex.Message}");
        }
    }

    private async void OnFileChanged(object? sender, FileRecord record)
    {
        try
        {
            var updated = await _fileRepository.UpdateAsync(record);
            if (!updated)
                await _fileRepository.AddAsync(record);
        }
        catch (Exception ex)
        {
            _logger.LogError("WATCHER_CHANGE_DB_ERROR", $"Failed to update file: {ex.Message}");
        }
    }

    private async void OnFileDeleted(object? sender, string path)
    {
        try
        {
            await _fileRepository.DeleteByPathAsync(path);
        }
        catch (Exception ex)
        {
            _logger.LogError("WATCHER_DELETE_DB_ERROR", $"Failed to delete file: {ex.Message}");
        }
    }

    private async void OnFileRenamed(object? sender, (string OldPath, string NewPath) e)
    {
        try
        {
            var record = await _fileRepository.GetByPathAsync(e.OldPath);
            if (record != null)
            {
                var newInfo = new FileInfo(e.NewPath);
                record.Path = newInfo.FullName;
                record.FileName = newInfo.Name;
                record.Extension = newInfo.Extension.ToLowerInvariant();
                record.SizeBytes = newInfo.Length;
                record.UpdatedTime = newInfo.LastWriteTimeUtc;
                record.Category = FileCategoryHelper.DetermineCategory(newInfo.Extension);
                await _fileRepository.UpdateAsync(record);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError("WATCHER_RENAME_DB_ERROR", $"Failed to rename file: {ex.Message}");
        }
    }

    private void LoadWatchedDirectories()
    {
        try
        {
            var configPath = _pathProvider.GetWatchedDirectoriesFilePath();
            if (!File.Exists(configPath)) return;
            var json = File.ReadAllText(configPath);
            var list = JsonSerializer.Deserialize<List<string>>(json);
            if (list != null)
            {
                foreach (var dir in list)
                {
                    if (Directory.Exists(dir) && !WatchedDirectories.Contains(dir))
                    {
                        WatchedDirectories.Add(dir);
                        _fileWatcherService.AddWatchPath(dir);
                    }
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError("WATCHER_LOAD_ERROR", $"Failed to load watched directories: {ex.Message}");
        }
    }

    private void SaveWatchedDirectories()
    {
        try
        {
            var configPath = _pathProvider.GetWatchedDirectoriesFilePath();
            var dir = Path.GetDirectoryName(configPath);
            if (!string.IsNullOrEmpty(dir))
                Directory.CreateDirectory(dir);
            var list = WatchedDirectories.ToList();
            var json = JsonSerializer.Serialize(list, new JsonSerializerOptions { WriteIndented = true });
            File.WriteAllText(configPath, json);
        }
        catch (Exception ex)
        {
            _logger.LogError("WATCHER_SAVE_ERROR", $"Failed to save watched directories: {ex.Message}");
        }
    }

    private static string GetDirectorySize(string path)
    {
        if (!Directory.Exists(path)) return "0 B";
        try
        {
            long size = Directory.EnumerateFiles(path, "*", SearchOption.AllDirectories)
                                .Sum(f => new FileInfo(f).Length);
            string[] units = { "B", "KB", "MB", "GB", "TB" };
            int idx = 0;
            double dsize = size;
            while (dsize >= 1024 && idx < units.Length - 1)
            {
                dsize /= 1024;
                idx++;
            }
            return $"{dsize:F1} {units[idx]}";
        }
        catch
        {
            return "无法计算";
        }
    }

    private async Task LoadAppDataSizeAsync()
    {
        var dataPath = DataFolderPath;
        if (_lastCalculatedPath == dataPath && _appDataTotalSize != "正在计算...")
            return;

        _lastCalculatedPath = dataPath;
        _appDataTotalSize = "正在计算...";
        OnPropertyChanged(nameof(AppDataTotalSize));

        try
        {
            var size = await Task.Run(() => GetDirectorySize(dataPath));
            _appDataTotalSize = size;
        }
        catch (Exception)
        {
            _appDataTotalSize = "无法计算";
        }
        finally
        {
            OnPropertyChanged(nameof(AppDataTotalSize));
        }
    }

    partial void OnPortableModeEnabledChanged(bool value)
    {
        if (_isInitializingSettings) return;

        if (value == _pathProvider.IsPortableMode) return;

        _ = SwitchPortableModeAsync(value);
        _ = LoadAppDataSizeAsync();
    }

    private async Task SwitchPortableModeAsync(bool targetMode)
    {
        try
        {
            await _dialogService.ShowMessageAsync("切换便携模式", "正在迁移数据，请稍候...");

            await _pathProvider.SetPortableModeAsync(targetMode);

            SaveSettings();
            SaveWatchedDirectories();

            OnPropertyChanged(nameof(DataFolderPath));
            OnPropertyChanged(nameof(LogFolderPath));
            OnPropertyChanged(nameof(DatabaseFilePath));

            await _dialogService.ShowMessageAsync(
                "切换成功",
                "便携模式切换完成。\n数据已成功迁移。"
            );
        }
        catch (Exception ex)
        {
            _isInitializingSettings = true;
            PortableModeEnabled = !targetMode;
            _isInitializingSettings = false;
            await _dialogService.ShowMessageAsync("切换失败", $"数据迁移失败: {ex.Message}");
        }
    }

    public void Dispose()
    {
        _themeService.ThemeChanged -= OnThemeChanged;
        _fileWatcherService.FileCreated -= OnFileCreated;
        _fileWatcherService.FileChanged -= OnFileChanged;
        _fileWatcherService.FileDeleted -= OnFileDeleted;
        _fileWatcherService.FileRenamed -= OnFileRenamed;
        _cancellationTokenSource?.Cancel();
        _cancellationTokenSource?.Dispose();
        SaveWatchedDirectories();
        SaveSettings();
        _fileWatcherService.StopAll();
        GC.SuppressFinalize(this);
    }

    private class SettingsData
    {
        public bool MinimizeToTray { get; set; }
        public int CloseAction { get; set; }
        public bool AutoIndex { get; set; }
        public bool AutoMonitor { get; set; }
        public bool IsAiModeEnabled { get; set; } // 新增
    }
}
