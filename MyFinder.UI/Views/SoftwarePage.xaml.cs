using Microsoft.UI.Xaml.Controls;
using MyFinder.Core.ViewModels;
using MyFinder.UI.Common;

namespace MyFinder.UI.Views;

public sealed partial class SoftwarePage : Page
{
    public SoftwareViewModel ViewModel => (SoftwareViewModel)DataContext;

    public SoftwarePage()
    {
        InitializeComponent();
        ViewModelBinder.Bind<SoftwareViewModel>(this);
    }
}
