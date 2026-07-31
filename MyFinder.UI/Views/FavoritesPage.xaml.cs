using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Navigation;
using MyFinder.Core.ViewModels;
using MyFinder.UI.Common;
using MyFinder.UI.Services;

namespace MyFinder.UI.Views;

public sealed partial class FavoritesPage : Page
{
    public FavoritesViewModel ViewModel => (FavoritesViewModel)DataContext;

    public FavoritesPage()
    {
        InitializeComponent();
        ViewModelBinder.Bind<FavoritesViewModel>(this);
    }

    protected override async void OnNavigatedTo(NavigationEventArgs e)
    {
        base.OnNavigatedTo(e);
        if (ViewModel != null)
        {
            await ViewModel.RefreshAsync();
        }
    }

    private void OnAddFavoriteClick(object sender, RoutedEventArgs e)
    {
        ViewModel.AddFavoriteFolderCommand.Execute(App.CurrentWindow);
    }

    private async void OnRefreshClick(object sender, RoutedEventArgs e)
    {
        if (ViewModel != null)
        {
            await ViewModel.RefreshAsync();
            MemoryOptimizer.OptimizeMemory();
        }
    }
}