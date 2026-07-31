using System.Collections.ObjectModel;
using System.Diagnostics;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using MyFinder.Core.Interfaces;
using MyFinder.Core.Interfaces.Repositories;
using MyFinder.Models.Entities;

namespace MyFinder.Core.ViewModels;

public partial class HomeViewModel : BaseViewModel
{
    private readonly IFileRepository _fileRepository;
    private readonly ISoftwareRepository _softwareRepository;
    private readonly ISearchEngine _searchEngine;
    private readonly INaturalLanguageService _naturalLanguageService;
    private readonly IFavoriteRepository _favoriteRepository;
    private readonly IFileWatcherService _fileWatcherService;
    private readonly IDispatcherService _dispatcherService;
    private readonly SettingsViewModel _settingsViewModel;

    // 防抖定时器
    private System.Threading.Timer? _debounceTimer;
    private readonly int _debounceDelayMs = 300;
    private string _pendingQuery = string.Empty;

    [ObservableProperty]
    private string _searchQuery = string.Empty;

    [ObservableProperty]
    private bool _hasNoRecentFiles = true;

    [ObservableProperty]
    private bool _hasNoSearchResults;

    [ObservableProperty]
    private bool _showDeepSearchButton;

    [ObservableProperty]
    private bool _isDeepSearching;

    [ObservableProperty]
    private string _aiParsedDescription = string.Empty;

    // AI 模式从 SettingsViewModel 同步
    public bool IsAiModeEnabled => _settingsViewModel.IsAiModeEnabled;

    public ObservableCollection<FileRecord> RecentFiles { get; } = new();
    public ObservableCollection<FileRecord> SearchResults { get; } = new();

    // 可搜索文件夹列表
    public ObservableCollection<string> WatchedDirectories { get; } = new();

    private bool _hasWatchedDirectories;
    public bool HasWatchedDirectories
    {
        get => _hasWatchedDirectories;
        private set => SetProperty(ref _hasWatchedDirectories, value);
    }

    public bool ShowRecentEmptyState => string.IsNullOrEmpty(SearchQuery) && HasNoRecentFiles;
    public bool ShowSearchEmptyState => !string.IsNullOrEmpty(SearchQuery) && HasNoSearchResults;

    private List<FileRecord>? _currentFtsResults;

    partial void OnHasNoSearchResultsChanged(bool value)
    {
        OnPropertyChanged(nameof(ShowSearchEmptyState));
    }

    partial void OnSearchQueryChanged(string value)
    {
        OnPropertyChanged(nameof(ShowRecentEmptyState));
        OnPropertyChanged(nameof(ShowSearchEmptyState));

        _debounceTimer?.Dispose();

        if (string.IsNullOrWhiteSpace(value))
        {
            ShowDeepSearchButton = false;
            IsDeepSearching = false;
            _currentFtsResults = null;
            AiParsedDescription = string.Empty;

            _dispatcherService.Enqueue(() =>
            {
                SearchResults.Clear();
                HasNoSearchResults = false;
            });

            _ = LoadRecentFilesAsync();
            return;
        }

        _pendingQuery = value;
        _debounceTimer = new System.Threading.Timer(
            _ => _ = ExecuteSearchAsync(_pendingQuery),
            null,
            _debounceDelayMs,
            System.Threading.Timeout.Infinite);
    }

    private async Task ExecuteSearchAsync(string query)
    {
        await SearchAsync(query);
    }

    public HomeViewModel(
        IFileRepository fileRepository,
        ISoftwareRepository softwareRepository,
        ISearchEngine searchEngine,
        INaturalLanguageService naturalLanguageService,
        IFavoriteRepository favoriteRepository,
        IFileWatcherService fileWatcherService,
        IDispatcherService dispatcherService,
        SettingsViewModel settingsViewModel)
    {
        _fileRepository = fileRepository ?? throw new ArgumentNullException(nameof(fileRepository));
        _softwareRepository = softwareRepository ?? throw new ArgumentNullException(nameof(softwareRepository));
        _searchEngine = searchEngine ?? throw new ArgumentNullException(nameof(searchEngine));
        _naturalLanguageService = naturalLanguageService ?? throw new ArgumentNullException(nameof(naturalLanguageService));
        _favoriteRepository = favoriteRepository ?? throw new ArgumentNullException(nameof(favoriteRepository));
        _fileWatcherService = fileWatcherService ?? throw new ArgumentNullException(nameof(fileWatcherService));
        _dispatcherService = dispatcherService ?? throw new ArgumentNullException(nameof(dispatcherService));
        _settingsViewModel = settingsViewModel ?? throw new ArgumentNullException(nameof(settingsViewModel));

        Title = "首页";

        // 监听 SettingsViewModel 的 AI 模式变化
        _settingsViewModel.PropertyChanged += (s, e) =>
        {
            if (e.PropertyName == nameof(SettingsViewModel.IsAiModeEnabled))
            {
                OnPropertyChanged(nameof(IsAiModeEnabled));
                if (!string.IsNullOrWhiteSpace(SearchQuery))
                {
                    _ = SearchAsync();
                }
            }
        };

        _fileWatcherService.FileCreated += (s, e) => _ = RefreshWatchedDirectoriesAsync();
        _fileWatcherService.FileDeleted += (s, e) => _ = RefreshWatchedDirectoriesAsync();
        _fileWatcherService.FileRenamed += (s, e) => _ = RefreshWatchedDirectoriesAsync();

        SettingsViewModel.WatchedDirectoriesChanged += (s, e) => _ = RefreshWatchedDirectoriesAsync();

        _ = RefreshWatchedDirectoriesAsync();
    }

    public override async Task InitializeAsync()
    {
        if (IsInitialized) return;

        IsLoading = true;
        ClearError();

        try
        {
            await LoadRecentFilesAsync();
            await RefreshWatchedDirectoriesAsync();
            await base.InitializeAsync();
        }
        catch (Exception ex)
        {
            SetError($"数据加载失败: {ex.Message}");
        }
        finally
        {
            IsLoading = false;
        }
    }

    [RelayCommand]
    public async Task RefreshAsync()
    {
        if (IsLoading) return;

        IsLoading = true;
        try
        {
            await RefreshWatchedDirectoriesAsync();
            await LoadRecentFilesAsync();
        }
        catch (Exception ex)
        {
            SetError($"刷新失败: {ex.Message}");
        }
        finally
        {
            IsLoading = false;
        }
    }

    private async Task LoadRecentFilesAsync()
    {
        var files = await _fileRepository.GetAllAsync(50);
        _dispatcherService.Enqueue(() =>
        {
            RecentFiles.Clear();
            foreach (var file in files)
            {
                RecentFiles.Add(file);
            }
            HasNoRecentFiles = RecentFiles.Count == 0;
        });
    }

    private async Task RefreshWatchedDirectoriesAsync()
    {
        var paths = _fileWatcherService.WatchedPaths;
        _dispatcherService.Enqueue(() =>
        {
            WatchedDirectories.Clear();
            foreach (var path in paths)
            {
                WatchedDirectories.Add(path);
            }
            HasWatchedDirectories = WatchedDirectories.Count > 0;
        });
        await Task.CompletedTask;
    }

    [RelayCommand]
    private async Task SearchAsync(string? query = null)
    {
        var searchText = query ?? SearchQuery;

        if (string.IsNullOrWhiteSpace(searchText))
        {
            _dispatcherService.Enqueue(() =>
            {
                SearchResults.Clear();
                HasNoSearchResults = false;
                ShowDeepSearchButton = false;
                AiParsedDescription = string.Empty;
                IsBusy = false;
            });
            await LoadRecentFilesAsync();
            return;
        }

        _dispatcherService.Enqueue(() => IsBusy = true);

        IsDeepSearching = false;
        _currentFtsResults = null;

        try
        {
            string actualQuery = searchText;

            // AI 模式启用时解析自然语言
            if (IsAiModeEnabled)
            {
                var nlResult = _naturalLanguageService.ParseQuery(searchText);
                if (nlResult.IsNaturalLanguage)
                {
                    AiParsedDescription = nlResult.ParsedDescription;
                    actualQuery = string.IsNullOrEmpty(nlResult.ExtractedSearchText) ? searchText : nlResult.ExtractedSearchText;
                }
                else
                {
                    AiParsedDescription = string.Empty;
                }
            }
            else
            {
                AiParsedDescription = string.Empty;
            }

            var results = await _searchEngine.SearchFilesAsync(actualQuery, 100);
            var resultList = results.ToList();
            _currentFtsResults = resultList;

            _dispatcherService.Enqueue(() =>
            {
                SearchResults.Clear();
                foreach (var item in resultList)
                {
                    SearchResults.Add(item);
                }
                HasNoSearchResults = SearchResults.Count == 0;
                ShowDeepSearchButton = !string.IsNullOrEmpty(actualQuery) && resultList.Count > 0;
                IsBusy = false;
            });
        }
        catch (Exception ex)
        {
            SetError($"搜索出错: {ex.Message}");
            _dispatcherService.Enqueue(() => IsBusy = false);
        }
    }

    [RelayCommand]
    private async Task DeepSearchAsync()
    {
        if (string.IsNullOrWhiteSpace(SearchQuery) || IsDeepSearching)
            return;

        IsDeepSearching = true;

        try
        {
            var likeResults = await _searchEngine.LikeSearchAsync(SearchQuery, 100);
            var likeList = likeResults.ToList();

            var merged = new Dictionary<long, FileRecord>();
            if (_currentFtsResults != null)
            {
                foreach (var item in _currentFtsResults)
                    merged.TryAdd(item.Id, item);
            }
            foreach (var item in likeList)
                merged.TryAdd(item.Id, item);

            var finalResults = merged.Values.OrderByDescending(f => f.UpdatedTime).ToList();

            _dispatcherService.Enqueue(() =>
            {
                SearchResults.Clear();
                foreach (var item in finalResults)
                {
                    SearchResults.Add(item);
                }
                HasNoSearchResults = SearchResults.Count == 0;
            });
        }
        catch (Exception ex)
        {
            SetError($"深度搜索失败: {ex.Message}");
        }
        finally
        {
            IsDeepSearching = false;
        }
    }

    [RelayCommand]
    private void OpenFile(FileRecord? record)
    {
        if (record == null || string.IsNullOrEmpty(record.Path)) return;
        try
        {
            if (File.Exists(record.Path))
                Process.Start(new ProcessStartInfo(record.Path) { UseShellExecute = true });
            else if (Directory.Exists(record.Path))
                Process.Start("explorer.exe", record.Path);
        }
        catch (Exception ex)
        {
            SetError($"打开文件失败: {ex.Message}");
        }
    }

    [RelayCommand]
    private void OpenInExplorer(FileRecord? record)
    {
        if (record == null || string.IsNullOrEmpty(record.Path)) return;
        try
        {
            if (File.Exists(record.Path))
                Process.Start("explorer.exe", $"/select,\"{record.Path}\"");
            else if (Directory.Exists(record.Path))
                Process.Start("explorer.exe", record.Path);
        }
        catch (Exception ex)
        {
            SetError($"打开所在文件夹失败: {ex.Message}");
        }
    }

    [RelayCommand]
    public async Task ToggleFavoriteAsync(FileRecord? record)
    {
        if (record == null || string.IsNullOrEmpty(record.Path)) return;

        try
        {
            bool exists = await _favoriteRepository.ExistsAsync(record.Path);
            if (exists)
            {
                var favorites = await _favoriteRepository.GetAllAsync();
                var match = favorites.FirstOrDefault(f => f.TargetPath.Equals(record.Path, StringComparison.OrdinalIgnoreCase));
                if (match != null)
                    await _favoriteRepository.DeleteAsync(match.Id);
            }
            else
            {
                await _favoriteRepository.AddAsync(new FavoriteRecord
                {
                    TargetPath = record.Path,
                    TargetType = File.Exists(record.Path) ? 0 : 1,
                    DisplayAlias = record.FileName,
                    CreatedTime = DateTime.UtcNow,
                    UpdatedTime = DateTime.UtcNow
                });
            }
        }
        catch (Exception ex)
        {
            SetError($"操作收藏失败: {ex.Message}");
        }
    }

    public async Task<bool> IsFavoriteAsync(string path)
    {
        if (string.IsNullOrEmpty(path)) return false;
        return await _favoriteRepository.ExistsAsync(path);
    }
}