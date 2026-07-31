using Microsoft.Extensions.DependencyInjection;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using MyFinder.Core.Interfaces;
using MyFinder.Core.ViewModels;
using MyFinder.UI.Services;

namespace MyFinder.UI;

public sealed partial class MainWindow : Window
{
    private readonly IFileWatcherService _watcher;
    private readonly SettingsViewModel _settingsVM;
    private readonly TrayService _trayService;

    public bool IsTrayExit { get; set; } = false;

    public MainWindow()
    {
        InitializeComponent();

        ExtendsContentIntoTitleBar = true;
        if (AppWindowTitleBar.IsCustomizationSupported())
        {
            this.AppWindow.TitleBar.ExtendsContentIntoTitleBar = true;
        }

        _watcher = App.Services.GetRequiredService<IFileWatcherService>();
        _settingsVM = App.Services.GetRequiredService<SettingsViewModel>();
        _trayService = new TrayService(this);

        _trayService.HideTrayIcon();

        var iconPath = System.IO.Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "MyFinder.ico");
        if (System.IO.File.Exists(iconPath))
        {
            this.AppWindow.SetIcon(iconPath);
        }

        var appWindow = this.AppWindow;
        if (appWindow != null)
        {
            appWindow.Closing += OnAppWindowClosing;
        }
    }

    private async void OnAppWindowClosing(object? sender, AppWindowClosingEventArgs e)
    {
        if (IsTrayExit)
        {
            _watcher.StopAll();
            _settingsVM.Dispose();
            _trayService.HideTrayIcon();
            _trayService.Dispose();
            Application.Current.Exit();
            Environment.Exit(0);
            return;
        }

        if (_settingsVM.IsIndexing)
        {
            e.Cancel = true;
            if (this.Content?.XamlRoot != null)
            {
                var dialog = new ContentDialog
                {
                    Title = "正在进行文件索引",
                    Content = "当前正在后台扫描索引文件，确定要取消索引并退出程序吗？",
                    PrimaryButtonText = "取消索引并退出",
                    CloseButtonText = "继续后台运行",
                    XamlRoot = this.Content.XamlRoot
                };

                var result = await dialog.ShowAsync();
                if (result == ContentDialogResult.Primary)
                {
                    _settingsVM.CancelIndexingCommand.Execute(null);
                    IsTrayExit = true;
                    this.Close();
                }
            }
            return;
        }

        if (_settingsVM.MinimizeToTrayEnabled && _settingsVM.CloseButtonAction == 1)
        {
            e.Cancel = true;
            this.AppWindow.Hide();
            _trayService.ShowTrayIcon();
        }
        else
        {
            _watcher.StopAll();
            _settingsVM.Dispose();
            _trayService.HideTrayIcon();
            _trayService.Dispose();
            Application.Current.Exit();
            Environment.Exit(0);
        }
    }

    public void ShowWindow()
    {
        this.AppWindow.Show();
        this.Activate();
        _trayService.HideTrayIcon();
    }
}