using Microsoft.UI.Xaml;

namespace MyFinder.UI.Views;

public sealed partial class SplashWindow : Window
{
    public SplashWindow()
    {
        InitializeComponent();
        ExtendsContentIntoTitleBar = true;
        SetTitleBar(null);
    }
}
