using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;

namespace MyFinder.Core.ViewModels;

public partial class TreeNodeModel : ObservableObject
{
    [ObservableProperty]
    private string _name = string.Empty;

    [ObservableProperty]
    private string _fullPath = string.Empty;

    [ObservableProperty]
    private bool _isDirectory;

    [ObservableProperty]
    private bool _isExpanded;

    [ObservableProperty]
    private bool _isLoaded;

    [ObservableProperty]
    private string _iconGlyph = "\uE8B7"; // Folder icon

    public ObservableCollection<TreeNodeModel> Children { get; } = new();

    public TreeNodeModel(string name, string fullPath, bool isDirectory)
    {
        Name = name;
        FullPath = fullPath;
        IsDirectory = isDirectory;
        IconGlyph = isDirectory ? "\uE8B7" : "\uE7C3";

        // Add a placeholder child for lazy loading
        if (isDirectory)
        {
            Children.Add(new TreeNodeModel("加载中...", string.Empty, false));
        }
    }
}