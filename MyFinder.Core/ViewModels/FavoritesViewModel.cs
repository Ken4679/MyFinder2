using System.Collections.ObjectModel;
using System.Diagnostics;
using System.IO;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using MyFinder.Core.Interfaces;
using MyFinder.Core.Interfaces.Repositories;
using MyFinder.Models.Entities;

namespace MyFinder.Core.ViewModels;

public partial class FavoritesViewModel : BaseViewModel
{
    private readonly IFavoriteRepository _favoriteRepository;
    private readonly IFolderPickerService _folderPickerService;
    private readonly IDispatcherService _dispatcherService;

    [ObservableProperty]
    private bool _hasNoItems = true;

    public ObservableCollection<FavoriteRecord> Favorites { get; } = new();

    public FavoritesViewModel(
        IFavoriteRepository favoriteRepository,
        IFolderPickerService folderPickerService,
        IDispatcherService dispatcherService)
    {
        _favoriteRepository = favoriteRepository ?? throw new ArgumentNullException(nameof(favoriteRepository));
        _folderPickerService = folderPickerService ?? throw new ArgumentNullException(nameof(folderPickerService));
        _dispatcherService = dispatcherService ?? throw new ArgumentNullException(nameof(dispatcherService));
        Title = "收藏";
    }

    public override async Task InitializeAsync()
    {
        if (IsInitialized) return;

        IsLoading = true;
        ClearError();

        try
        {
            var items = await _favoriteRepository.GetAllAsync();
            _dispatcherService.Enqueue(() =>
            {
                Favorites.Clear();
                foreach (var item in items.OrderByDescending(f => f.CreatedTime))
                {
                    Favorites.Add(item);
                }
                HasNoItems = Favorites.Count == 0;
            });
        }
        catch (Exception ex)
        {
            SetError($"加载收藏失败: {ex.Message}");
        }
        finally
        {
            IsLoading = false;
        }

        await base.InitializeAsync();
    }

    [RelayCommand]
    private async Task RemoveFavoriteAsync(long id)
    {
        try
        {
            await _favoriteRepository.DeleteAsync(id);
            _dispatcherService.Enqueue(() =>
            {
                var item = Favorites.FirstOrDefault(f => f.Id == id);
                if (item != null)
                {
                    Favorites.Remove(item);
                }
                HasNoItems = Favorites.Count == 0;
            });
        }
        catch (Exception ex)
        {
            SetError($"移除收藏失败: {ex.Message}");
        }
    }

    [RelayCommand]
    private async Task AddFavoriteFolderAsync(object? window)
    {
        if (window == null) return;
        try
        {
            var folder = await _folderPickerService.PickFolderAsync(window);
            if (!string.IsNullOrEmpty(folder) && Directory.Exists(folder))
            {
                bool exists = await _favoriteRepository.ExistsAsync(folder);
                if (!exists)
                {
                    var record = new FavoriteRecord
                    {
                        TargetPath = folder,
                        TargetType = 1,
                        DisplayAlias = Path.GetFileName(folder.TrimEnd(Path.DirectorySeparatorChar)),
                        CreatedTime = DateTime.UtcNow,
                        UpdatedTime = DateTime.UtcNow
                    };
                    await _favoriteRepository.AddAsync(record);
                    _dispatcherService.Enqueue(() =>
                    {
                        Favorites.Insert(0, record);
                        HasNoItems = false;
                    });
                }
            }
        }
        catch (Exception ex)
        {
            SetError($"添加收藏失败: {ex.Message}");
        }
    }

    [RelayCommand]
    private void OpenFavorite(FavoriteRecord? item)
    {
        if (item == null || string.IsNullOrEmpty(item.TargetPath)) return;
        try
        {
            if (File.Exists(item.TargetPath) || Directory.Exists(item.TargetPath))
            {
                Process.Start(new ProcessStartInfo(item.TargetPath) { UseShellExecute = true });
            }
        }
        catch (Exception ex)
        {
            SetError($"打开失败: {ex.Message}");
        }
    }

    [RelayCommand]
    private void OpenInExplorer(FavoriteRecord? item)
    {
        if (item == null || string.IsNullOrEmpty(item.TargetPath)) return;
        try
        {
            if (File.Exists(item.TargetPath))
            {
                Process.Start("explorer.exe", $"/select,\"{item.TargetPath}\"");
            }
            else if (Directory.Exists(item.TargetPath))
            {
                Process.Start("explorer.exe", item.TargetPath);
            }
        }
        catch (Exception ex)
        {
            SetError($"打开所在文件夹失败: {ex.Message}");
        }
    }

    [RelayCommand]
    public async Task RefreshAsync()
    {
        // 关键重置：解除初始化拦截，强制重新读取 SQLite
        IsInitialized = false;
        await InitializeAsync();
    }
}