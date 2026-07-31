using Microsoft.Extensions.DependencyInjection;
using Microsoft.UI.Xaml.Controls;
using MyFinder.Core.Interfaces;
using MyFinder.Core.ViewModels;

namespace MyFinder.UI.Views;

public sealed partial class ShellPage : Page
{
    private INavigationService? _navigationService;

    public ShellViewModel ViewModel { get; }

    public ShellPage()
    {
        InitializeComponent();
        ViewModel = App.Services.GetRequiredService<ShellViewModel>();
        DataContext = ViewModel;

        _navigationService = App.Services.GetRequiredService<INavigationService>();
        _navigationService.NavigationRequested += OnNavigationRequested;
        _navigationService.BackRequested += OnBackRequested;

        Unloaded += OnShellPageUnloaded;

        NavView.SelectedItem = NavHome;
        _navigationService.NavigateTo("Home");
    }

    private void OnShellPageUnloaded(object sender, Microsoft.UI.Xaml.RoutedEventArgs e)
    {
        if (_navigationService != null)
        {
            _navigationService.NavigationRequested -= OnNavigationRequested;
            _navigationService.BackRequested -= OnBackRequested;
            _navigationService = null;
        }
        Unloaded -= OnShellPageUnloaded;
    }

    private void OnNavigationRequested(object? sender, NavigationRequestedEventArgs e)
    {
        if (_navigationService == null) return;
        var pageType = _navigationService.GetPageType(e.PageKey);
        if (pageType != null)
        {
            ContentFrame.Navigate(pageType, e.Parameter);
        }
    }

    private void OnBackRequested(object? sender, EventArgs e)
    {
        if (ContentFrame.CanGoBack)
        {
            ContentFrame.GoBack();
        }
    }

    private void NavView_SelectionChanged(NavigationView sender, NavigationViewSelectionChangedEventArgs args)
    {
        if (args.SelectedItem is NavigationViewItem item && item.Tag is string pageKey)
        {
            ViewModel.NavigateCommand.Execute(pageKey);
        }
    }
}