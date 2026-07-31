using System.Collections.ObjectModel;
using System.Diagnostics;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using MyFinder.Core.Interfaces;
using MyFinder.Core.Interfaces.Repositories;
using MyFinder.Models.Entities;

namespace MyFinder.Core.ViewModels;

public partial class RecentViewModel : BaseViewModel
{
    private readonly IFileRepository _fileRepository;
    private readonly IFavoriteRepository _favoriteRepository;
    private readonly IFileWatcherService _fileWatcherService;
    private readonly IDispatcherService _dispatcherService;

    [ObservableProperty]
    private bool _hasNoItems = true;

    public ObservableCollection<FileRecord> RecentFiles { get; } = new();

    public RecentViewModel(
        IFileRepository fileRepository,
        IFavoriteRepository favoriteRepository,
        IFileWatcherService fileWatcherService,
        IDispatcherService dispatcherService)
    {
        _fileRepository = fileRepository ?? throw new ArgumentNullException(nameof(fileRepository));
        _favoriteRepository = favoriteRepository ?? throw new ArgumentNullException(nameof(favoriteRepository));
        _fileWatcherService = fileWatcherService ?? throw new ArgumentNullException(nameof(fileWatcherService));
        _dispatcherService = dispatcherService ?? throw new ArgumentNullException(nameof(dispatcherService));

        Title = "最近文件";

        // 监听文件变化，自动刷新最近文件列表
        _fileWatcherService.FileCreated += (s, e) => _ = RefreshAsync();
        _fileWatcherService.FileDeleted += (s, e) => _ = RefreshAsync();
        _fileWatcherService.FileRenamed += (s, e) => _ = RefreshAsync();

        // 监控目录变化时也刷新（因为新增目录可能带来更多文件）
        SettingsViewModel.WatchedDirectoriesChanged += (s, e) => _ = RefreshAsync();
    }

    public override async Task InitializeAsync()
    {
        if (IsInitialized) return;

        IsLoading = true;
        ClearError();

        try
        {
            var files = await _fileRepository.GetAllAsync(100);
            _dispatcherService.Enqueue(() =>
            {
                RecentFiles.Clear();
                foreach (var file in files)
                {
                    RecentFiles.Add(file);
                }
                HasNoItems = RecentFiles.Count == 0;
            });
        }
        catch (Exception ex)
        {
            SetError($"加载最近文件失败: {ex.Message}");
        }
        finally
        {
            IsLoading = false;
        }

        await base.InitializeAsync();
    }

    [RelayCommand]
    public async Task RefreshAsync()
    {
        // 重置初始化状态，强制重新加载
        IsInitialized = false;
        await InitializeAsync();
    }

    [RelayCommand]
    private void OpenFile(FileRecord? record)
    {
        if (record == null || string.IsNullOrEmpty(record.Path)) return;
        try
        {
            if (File.Exists(record.Path))
            {
                Process.Start(new ProcessStartInfo(record.Path) { UseShellExecute = true });
            }
            else if (Directory.Exists(record.Path))
            {
                Process.Start("explorer.exe", record.Path);
            }
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
            {
                Process.Start("explorer.exe", $"/select,\"{record.Path}\"");
            }
            else if (Directory.Exists(record.Path))
            {
                Process.Start("explorer.exe", record.Path);
            }
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
                {
                    await _favoriteRepository.DeleteAsync(match.Id);
                }
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