using H.NotifyIcon;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace MyFinder.UI.Services;

public class TrayService : IDisposable
{
    private readonly TaskbarIcon _trayIcon;
    private readonly Window _mainWindow;
    private bool _isExiting = false;

    public TrayService(Window mainWindow)
    {
        _mainWindow = mainWindow ?? throw new ArgumentNullException(nameof(mainWindow));

        var flyout = new MenuFlyout();
        var showItem = new MenuFlyoutItem { Text = "显示主窗口" };
        showItem.Click += (s, e) => ShowMainWindow();
        flyout.Items.Add(showItem);

        var exitItem = new MenuFlyoutItem { Text = "退出" };
        exitItem.Click += (s, e) => ExitApplication();
        flyout.Items.Add(exitItem);

        _trayIcon = new TaskbarIcon
        {
            ToolTipText = "MyFinder",
            ContextFlyout = flyout
        };

        _trayIcon.Icon = GetTrayIcon();
        _trayIcon.LeftClickCommand = new CommunityToolkit.Mvvm.Input.RelayCommand(ShowMainWindow);
        _trayIcon.ForceCreate();
    }

    private static System.Drawing.Icon GetTrayIcon()
    {
        var iconPath = System.IO.Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "MyFinder.ico");
        if (System.IO.File.Exists(iconPath))
            return new System.Drawing.Icon(iconPath);
        else
            return System.Drawing.Icon.ExtractAssociatedIcon(Environment.ProcessPath!)!;
    }

    public void ShowTrayIcon()
    {
        _trayIcon.Visibility = Visibility.Visible;
    }

    public void HideTrayIcon()
    {
        _trayIcon.Visibility = Visibility.Collapsed;
    }

    private void ShowMainWindow()
    {
        if (_mainWindow != null)
        {
            _mainWindow.DispatcherQueue.TryEnqueue(() =>
            {
                if (_mainWindow.AppWindow != null)
                {
                    _mainWindow.AppWindow.Show();
                }
                _mainWindow.Activate();
            });
        }
        HideTrayIcon();
    }

    private void ExitApplication()
    {
        if (_isExiting) return;
        _isExiting = true;

        HideTrayIcon();
        _trayIcon.Dispose();
        Environment.Exit(0);
    }

    public void Dispose()
    {
        _trayIcon?.Dispose();
    }
}