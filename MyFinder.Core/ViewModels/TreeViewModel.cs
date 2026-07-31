using System.Collections.ObjectModel;
using System.IO;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using MyFinder.Core.Interfaces;
using MyFinder.Core.Interfaces.Repositories;
using MyFinder.Models.Entities;

namespace MyFinder.Core.ViewModels;

public partial class TreeViewModel : BaseViewModel
{
    private readonly IFileWatcherService _fileWatcherService;
    private readonly IFavoriteRepository _favoriteRepository;
    private readonly ISecurityAuditLogger _logger;
    private readonly IDispatcherService _dispatcherService;

    public ObservableCollection<TreeNodeModel> RootNodes { get; } = new();

    public TreeViewModel(
        IFileWatcherService fileWatcherService,
        IFavoriteRepository favoriteRepository,
        ISecurityAuditLogger logger,
        IDispatcherService dispatcherService)
    {
        _fileWatcherService = fileWatcherService ?? throw new ArgumentNullException(nameof(fileWatcherService));
        _favoriteRepository = favoriteRepository ?? throw new ArgumentNullException(nameof(favoriteRepository));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        _dispatcherService = dispatcherService ?? throw new ArgumentNullException(nameof(dispatcherService));

        Title = "目录树";

        _fileWatcherService.FileCreated += OnFileCreated;
        _fileWatcherService.FileDeleted += OnFileDeleted;
        _fileWatcherService.FileRenamed += OnFileRenamed;

        // 订阅监控目录变化事件，自动刷新目录树
        SettingsViewModel.WatchedDirectoriesChanged += (s, e) => RefreshTree();
    }

    public override async Task InitializeAsync()
    {
        if (IsInitialized) return;

        LoadRoots();
        await base.InitializeAsync();
    }

    [RelayCommand]
    public void RefreshTree()
    {
        _dispatcherService.Enqueue(() =>
        {
            RootNodes.Clear();
            LoadRoots();
        });
    }

    private void LoadRoots()
    {
        var watchedPaths = _fileWatcherService.WatchedPaths;
        foreach (var path in watchedPaths)
        {
            if (Directory.Exists(path))
            {
                var dirInfo = new DirectoryInfo(path);
                var rootNode = new TreeNodeModel(dirInfo.Name, dirInfo.FullName, isDirectory: true);
                RootNodes.Add(rootNode);
            }
        }
    }

    [RelayCommand]
    public void ExpandNode(TreeNodeModel? node)
    {
        if (node == null || !node.IsDirectory || node.IsLoaded)
            return;

        _ = Task.Run(() =>
        {
            var subDirs = new List<TreeNodeModel>();
            var subFiles = new List<TreeNodeModel>();

            try
            {
                if (Directory.Exists(node.FullPath))
                {
                    var dirInfo = new DirectoryInfo(node.FullPath);

                    foreach (var dir in dirInfo.EnumerateDirectories())
                    {
                        if ((dir.Attributes & (FileAttributes.Hidden | FileAttributes.System)) != 0)
                            continue;
                        subDirs.Add(new TreeNodeModel(dir.Name, dir.FullName, isDirectory: true));
                    }

                    int count = 0;
                    foreach (var file in dirInfo.EnumerateFiles())
                    {
                        if ((file.Attributes & (FileAttributes.Hidden | FileAttributes.System)) != 0)
                            continue;
                        subFiles.Add(new TreeNodeModel(file.Name, file.FullName, isDirectory: false));
                        count++;
                        if (count >= 300) break;
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError("TREE_EXPAND_ERR", $"Failed to scan {node.FullPath}: {ex.Message}");
            }

            _dispatcherService.Enqueue(() =>
            {
                try
                {
                    node.Children.Clear();
                    foreach (var dir in subDirs)
                        node.Children.Add(dir);
                    foreach (var file in subFiles)
                        node.Children.Add(file);
                }
                catch (Exception ex)
                {
                    _logger.LogError("TREE_POPULATE_ERR", ex.Message);
                }
                finally
                {
                    node.IsLoaded = true;
                }
            });
        });
    }

    [RelayCommand]
    public void OpenFile(TreeNodeModel? node)
    {
        if (node == null || string.IsNullOrEmpty(node.FullPath)) return;
        try
        {
            if (File.Exists(node.FullPath) || Directory.Exists(node.FullPath))
            {
                System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(node.FullPath) { UseShellExecute = true });
            }
        }
        catch (Exception ex)
        {
            SetError($"打开失败: {ex.Message}");
        }
    }

    [RelayCommand]
    public void OpenInExplorer(TreeNodeModel? node)
    {
        if (node == null || string.IsNullOrEmpty(node.FullPath)) return;
        try
        {
            if (File.Exists(node.FullPath))
            {
                System.Diagnostics.Process.Start("explorer.exe", $"/select,\"{node.FullPath}\"");
            }
            else if (Directory.Exists(node.FullPath))
            {
                System.Diagnostics.Process.Start("explorer.exe", node.FullPath);
            }
        }
        catch (Exception ex)
        {
            SetError($"打开所在文件夹失败: {ex.Message}");
        }
    }

    [RelayCommand]
    public async Task ToggleFavoriteAsync(TreeNodeModel? node)
    {
        if (node == null || string.IsNullOrEmpty(node.FullPath)) return;

        try
        {
            bool exists = await _favoriteRepository.ExistsAsync(node.FullPath);
            if (exists)
            {
                var favorites = await _favoriteRepository.GetAllAsync();
                var match = favorites.FirstOrDefault(f => f.TargetPath.Equals(node.FullPath, StringComparison.OrdinalIgnoreCase));
                if (match != null)
                {
                    await _favoriteRepository.DeleteAsync(match.Id);
                }
            }
            else
            {
                await _favoriteRepository.AddAsync(new FavoriteRecord
                {
                    TargetPath = node.FullPath,
                    TargetType = node.IsDirectory ? 1 : 0,
                    DisplayAlias = node.Name,
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

    private void OnFileCreated(object? sender, FileRecord record)
    {
        _dispatcherService.Enqueue(() =>
        {
            try
            {
                var parentDir = Path.GetDirectoryName(record.Path);
                if (string.IsNullOrEmpty(parentDir)) return;

                var parentNode = FindNodeByPath(RootNodes, parentDir);
                if (parentNode != null && parentNode.IsLoaded)
                {
                    var fileName = Path.GetFileName(record.Path);
                    if (!parentNode.Children.Any(c => c.FullPath.Equals(record.Path, StringComparison.OrdinalIgnoreCase)))
                    {
                        parentNode.Children.Add(new TreeNodeModel(fileName, record.Path, isDirectory: false));
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError("TREE_CREATE_ERR", ex.Message);
            }
        });
    }

    private void OnFileDeleted(object? sender, string path)
    {
        _dispatcherService.Enqueue(() =>
        {
            try
            {
                var parentDir = Path.GetDirectoryName(path);
                if (string.IsNullOrEmpty(parentDir)) return;

                var parentNode = FindNodeByPath(RootNodes, parentDir);
                if (parentNode != null && parentNode.IsLoaded)
                {
                    var nodeToRemove = parentNode.Children.FirstOrDefault(c => c.FullPath.Equals(path, StringComparison.OrdinalIgnoreCase));
                    if (nodeToRemove != null)
                    {
                        parentNode.Children.Remove(nodeToRemove);
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError("TREE_DELETE_ERR", ex.Message);
            }
        });
    }

    private void OnFileRenamed(object? sender, (string OldPath, string NewPath) e)
    {
        OnFileDeleted(sender, e.OldPath);
        if (File.Exists(e.NewPath))
        {
            var info = new FileInfo(e.NewPath);
            OnFileCreated(sender, new FileRecord { Path = info.FullName, FileName = info.Name });
        }
    }

    private TreeNodeModel? FindNodeByPath(IEnumerable<TreeNodeModel> nodes, string targetPath)
    {
        foreach (var node in nodes)
        {
            if (node.FullPath.Equals(targetPath, StringComparison.OrdinalIgnoreCase))
                return node;

            if (node.IsDirectory && node.IsLoaded && targetPath.StartsWith(node.FullPath + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
            {
                var found = FindNodeByPath(node.Children, targetPath);
                if (found != null) return found;
            }
        }
        return null;
    }
}