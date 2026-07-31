using Microsoft.Extensions.DependencyInjection;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using MyFinder.Core.Interfaces;
using MyFinder.Core.ViewModels;
using MyFinder.Models.Entities;
using MyFinder.UI.Common;
using MyFinder.UI.Services;

namespace MyFinder.UI.Views;

public partial class HomePage : Page
{
    public HomeViewModel ViewModel => (HomeViewModel)DataContext;
    private readonly INavigationService _navigationService;

    public HomePage()
    {
        InitializeComponent();
        ViewModelBinder.Bind<HomeViewModel>(this);
        _navigationService = App.Services.GetRequiredService<INavigationService>();
    }

    private void OnRefreshClick(object sender, RoutedEventArgs e)
    {
        _ = ViewModel.RefreshAsync();
        MemoryOptimizer.OptimizeMemory();
    }

    private void AutoSuggestBox_QuerySubmitted(AutoSuggestBox sender, AutoSuggestBoxQuerySubmittedEventArgs args)
    {
        if (!string.IsNullOrEmpty(args.QueryText))
        {
            ViewModel.SearchQuery = args.QueryText;
        }
        ViewModel.SearchCommand.Execute(null);
    }

    private void AutoSuggestBox_TextChanged(AutoSuggestBox sender, AutoSuggestBoxTextChangedEventArgs args)
    {
        if (args.Reason == AutoSuggestionBoxTextChangeReason.UserInput)
        {
            ViewModel.SearchQuery = sender.Text;
        }
    }

    private void ListView_ItemClick(object sender, ItemClickEventArgs e)
    {
        if (e.ClickedItem is FileRecord record)
        {
            ViewModel.OpenFileCommand.Execute(record);
        }
    }

    private async void MenuFlyout_Opening(object sender, object e)
    {
        if (sender is MenuFlyout flyout)
        {
            foreach (var item in flyout.Items)
            {
                if (item is MenuFlyoutItem menuItem && menuItem.Tag is FileRecord record)
                {
                    if (menuItem.Name == "FavoriteMenuItem")
                    {
                        bool isFav = await ViewModel.IsFavoriteAsync(record.Path);
                        menuItem.Text = isFav ? "⭐ 取消收藏" : "⭐ 添加到收藏";
                    }
                }
            }
        }
    }

    private void OnOpenFileClick(object sender, RoutedEventArgs e)
    {
        if (sender is MenuFlyoutItem menuItem && menuItem.Tag is FileRecord record)
        {
            ViewModel.OpenFileCommand.Execute(record);
        }
    }

    private void OnOpenInExplorerClick(object sender, RoutedEventArgs e)
    {
        if (sender is MenuFlyoutItem menuItem && menuItem.Tag is FileRecord record)
        {
            ViewModel.OpenInExplorerCommand.Execute(record);
        }
    }

    private async void OnToggleFavoriteClick(object sender, RoutedEventArgs e)
    {
        if (sender is MenuFlyoutItem menuItem && menuItem.Tag is FileRecord record)
        {
            bool isFav = await ViewModel.IsFavoriteAsync(record.Path);
            await ViewModel.ToggleFavoriteCommand.ExecuteAsync(record);

            FavoriteTip.Subtitle = isFav ? "⭐ 已取消收藏" : "⭐ 已添加到收藏";
            FavoriteTip.IsOpen = true;
        }
    }
}
