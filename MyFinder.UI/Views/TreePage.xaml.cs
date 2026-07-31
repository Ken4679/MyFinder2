using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using MyFinder.Core.ViewModels;
using MyFinder.UI.Common;

namespace MyFinder.UI.Views;

public sealed partial class TreePage : Page
{
    public TreeViewModel ViewModel => (TreeViewModel)DataContext;

    public TreePage()
    {
        InitializeComponent();
        ViewModelBinder.Bind<TreeViewModel>(this);
    }

    private void FileTreeView_Expanding(TreeView sender, TreeViewExpandingEventArgs args)
    {
        if (args.Item is TreeNodeModel node)
        {
            ViewModel.ExpandNodeCommand.Execute(node);
        }
    }

    private void FileTreeView_ItemInvoked(TreeView sender, TreeViewItemInvokedEventArgs args)
    {
        if (args.InvokedItem is TreeNodeModel node && !node.IsDirectory)
        {
            ViewModel.OpenFileCommand.Execute(node);
        }
    }

    private async void MenuFlyout_Opening(object sender, object e)
    {
        if (sender is MenuFlyout flyout)
        {
            foreach (var item in flyout.Items)
            {
                if (item is MenuFlyoutItem menuItem && menuItem.Tag is TreeNodeModel node)
                {
                    if (menuItem.Name == "FavoriteMenuItem")
                    {
                        bool isFav = await ViewModel.IsFavoriteAsync(node.FullPath);
                        menuItem.Text = isFav ? "⭐ 取消收藏" : "⭐ 添加到收藏";
                    }
                }
            }
        }
    }

    private void OnOpenFileClick(object sender, RoutedEventArgs e)
    {
        if (sender is MenuFlyoutItem menuItem && menuItem.Tag is TreeNodeModel node)
        {
            ViewModel.OpenFileCommand.Execute(node);
        }
    }

    private void OnOpenInExplorerClick(object sender, RoutedEventArgs e)
    {
        if (sender is MenuFlyoutItem menuItem && menuItem.Tag is TreeNodeModel node)
        {
            ViewModel.OpenInExplorerCommand.Execute(node);
        }
    }

    private void OnToggleFavoriteClick(object sender, RoutedEventArgs e)
    {
        if (sender is MenuFlyoutItem menuItem && menuItem.Tag is TreeNodeModel node)
        {
            ViewModel.ToggleFavoriteCommand.Execute(node);
        }
    }
}