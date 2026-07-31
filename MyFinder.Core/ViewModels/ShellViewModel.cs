using CommunityToolkit.Mvvm.Input;
using MyFinder.Core.Interfaces;

namespace MyFinder.Core.ViewModels;

public partial class ShellViewModel : BaseViewModel
{
    private readonly INavigationService _navigationService;

    public ShellViewModel(INavigationService navigationService)
    {
        _navigationService = navigationService ?? throw new ArgumentNullException(nameof(navigationService));
    }

    [RelayCommand]
    private void Navigate(string pageKey)
    {
        if (!string.IsNullOrEmpty(pageKey))
        {
            _navigationService.NavigateTo(pageKey);
        }
    }
}
