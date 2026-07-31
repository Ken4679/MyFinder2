using Microsoft.Extensions.DependencyInjection;
using Microsoft.UI.Xaml.Controls;
using MyFinder.Core.ViewModels;

namespace MyFinder.UI.Common;

public static class ViewModelBinder
{
    public static void Bind<TViewModel>(Page page, bool autoInitialize = true) where TViewModel : BaseViewModel
    {
        var viewModel = App.Services.GetRequiredService<TViewModel>();
        page.DataContext = viewModel;

        if (autoInitialize && !viewModel.IsInitialized)
        {
            _ = viewModel.InitializeAsync();
        }
    }
}
