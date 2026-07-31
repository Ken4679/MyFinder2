using Microsoft.UI.Xaml.Controls;
using MyFinder.Core.ViewModels;
using MyFinder.UI.Common;

namespace MyFinder.UI.Views;

public sealed partial class RecentPage : Page
{
    public RecentViewModel ViewModel => (RecentViewModel)DataContext;

    public RecentPage()
    {
        InitializeComponent();
        ViewModelBinder.Bind<RecentViewModel>(this);
    }
}
