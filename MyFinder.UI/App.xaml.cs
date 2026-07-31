using Microsoft.Extensions.DependencyInjection;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using MyFinder.Backup;
using MyFinder.Core.Exceptions;
using MyFinder.Core.Interfaces;
using MyFinder.Core.Interfaces.Repositories;
using MyFinder.Core.ViewModels;
using MyFinder.Database.Connections;
using MyFinder.Database.Initialization;
using MyFinder.Database.Repositories;
using MyFinder.Index.FileScanner;
using MyFinder.Search.SearchEngine;
using MyFinder.Security.Audit;
using MyFinder.Services;
using MyFinder.Services.Navigation;
using MyFinder.Services.Software;
using MyFinder.Services.Startup;
using MyFinder.Services.Theme;
using MyFinder.UI.Services;
using MyFinder.UI.Views;

namespace MyFinder.UI;

public partial class App : Application
{
    public static IServiceProvider Services { get; private set; } = null!;

    public static Window? CurrentWindow { get; private set; }

    public static Window? MainWindow => CurrentWindow;

    public static HomeViewModel? HomeViewModel { get; private set; }

    private CancellationTokenSource? _autoIndexCts;
    private bool _isShowingDialog;
    private CancellationTokenSource? _memoryOptimizeCts;

    public App()
    {
        EmergencyLog("App constructor enter.");
        RegisterExceptionHandlers();
        InitializeComponent();
        Services = ConfigureServices();
        EmergencyLog("ConfigureServices completed.");
    }

    private static void EmergencyLog(string message)
    {
        try
        {
            var dir = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Logs");
            Directory.CreateDirectory(dir);
            var logPath = Path.Combine(dir, "emergency_startup.log");
            File.AppendAllText(logPath, $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss.fff}] {message}{Environment.NewLine}");
        }
        catch { }
    }

    private void RegisterExceptionHandlers()
    {
        this.UnhandledException += (sender, e) =>
        {
            EmergencyLog($"Unhandled UI Exception: {e.Message}");
            var logger = Services?.GetService<ISecurityAuditLogger>();
            logger?.LogError("ERR_UI_UNHANDLED", $"Unhandled UI exception: {e.Message}");
            e.Handled = true;
        };

        TaskScheduler.UnobservedTaskException += (sender, e) =>
        {
            EmergencyLog($"Unobserved Task Exception: {e.Exception.Message}");
            var logger = Services?.GetService<ISecurityAuditLogger>();
            logger?.LogError("ERR_TASK_UNOBSERVED", $"Unobserved task exception: {e.Exception.Message}");
            e.SetObserved();
        };

        AppDomain.CurrentDomain.UnhandledException += (sender, e) =>
        {
            EmergencyLog($"AppDomain Unhandled Exception: {e.ExceptionObject}");
            var logger = Services?.GetService<ISecurityAuditLogger>();
            logger?.LogError("ERR_APPDOMAIN_UNHANDLED", $"AppDomain unhandled exception: {e.ExceptionObject}");
        };
    }

    private static IServiceProvider ConfigureServices()
    {
        var services = new ServiceCollection();

        services.AddSingleton<ISecurityAuditLogger, SanitizedAuditLogger>();

        services.AddSingleton<IPathProvider, PathProvider>();

        services.AddSingleton<IDatabaseContext>(sp =>
            new DatabaseContext(
                sp.GetRequiredService<IPathProvider>(),
                sp.GetRequiredService<ISecurityAuditLogger>()));

        services.AddSingleton<IDatabaseInitializer, DatabaseInitializer>();
        services.AddSingleton<IBackupService, DatabaseBackupService>();

        services.AddSingleton<IFileRepository, FileRepository>();
        services.AddSingleton<ISoftwareRepository, SoftwareRepository>();
        services.AddSingleton<IFavoriteRepository, FavoriteRepository>();
        services.AddSingleton<ISearchHistoryRepository, SearchHistoryRepository>();

        services.AddSingleton<ISoftwareScanner, SoftwareScanner>();
        services.AddSingleton<IFileScanner, FileScanner>();
        services.AddSingleton<ISearchEngine, BasicSearchEngine>();
        services.AddSingleton<INaturalLanguageService, NaturalLanguageService>();

        services.AddSingleton<IFileWatcherService, FileWatcherService>();

        services.AddSingleton<IDialogService, DialogService>();

        services.AddSingleton<IStartupService, StartupService>();

        services.AddSingleton<INavigationService, NavigationService>();
        services.AddSingleton<IThemeService, ThemeService>();
        services.AddSingleton<ThemeSelectorService>();
        services.AddSingleton<StartupPipeline>();

        services.AddSingleton<IFolderPickerService, FolderPickerService>();
        services.AddSingleton<IDispatcherService, DispatcherService>();

        services.AddSingleton<ShellViewModel>();
        services.AddSingleton<HomeViewModel>();
        services.AddSingleton<TreeViewModel>();
        services.AddSingleton<SoftwareViewModel>();
        services.AddSingleton<RecentViewModel>();
        services.AddSingleton<FavoritesViewModel>();
        services.AddSingleton<SettingsViewModel>();

        services.AddTransient<HomePage>();
        services.AddTransient<TreePage>();
        services.AddTransient<RecentPage>();
        services.AddTransient<SoftwarePage>();
        services.AddTransient<FavoritesPage>();
        services.AddTransient<SettingsPage>();
        services.AddTransient<ShellPage>();

        return services.BuildServiceProvider();
    }

    protected override async void OnLaunched(LaunchActivatedEventArgs args)
    {
        EmergencyLog("OnLaunched start.");

        var startupPipeline = Services.GetRequiredService<StartupPipeline>();
        var result = await startupPipeline.RunAsync();

        if (!result.IsSuccess)
        {
            EmergencyLog($"Startup Pipeline Failed: {result.ErrorCode} - {result.UserFriendlyMessage}");
            var logger = Services.GetRequiredService<ISecurityAuditLogger>();
            logger.LogError(result.ErrorCode, "Startup failed.");
            return;
        }

        var navigationService = Services.GetRequiredService<INavigationService>();
        navigationService.RegisterPage("Home", typeof(HomePage));
        navigationService.RegisterPage("Tree", typeof(TreePage));
        navigationService.RegisterPage("Recent", typeof(RecentPage));
        navigationService.RegisterPage("Software", typeof(SoftwarePage));
        navigationService.RegisterPage("Favorites", typeof(FavoritesPage));
        navigationService.RegisterPage("Settings", typeof(SettingsPage));

        CurrentWindow = new MainWindow();
        CurrentWindow.Activate();
        EmergencyLog("MainWindow Activated successfully.");

        // 保存 HomeViewModel 单例以便外部刷新
        HomeViewModel = Services.GetRequiredService<HomeViewModel>();

        // 订阅 SettingsViewModel 的索引完成事件
        SettingsViewModel.IndexingCompleted += OnIndexingCompleted;

        // 启动后台 10 秒内存压缩定时器
        _memoryOptimizeCts = new CancellationTokenSource();
        _ = Task.Run(async () =>
        {
            var token = _memoryOptimizeCts.Token;
            while (!token.IsCancellationRequested)
            {
                await Task.Delay(10000, token);
                if (!token.IsCancellationRequested)
                {
                    MyFinder.UI.Services.MemoryOptimizer.OptimizeMemory();
                }
            }
        }, _memoryOptimizeCts.Token);

        var themeSelector = Services.GetRequiredService<ThemeSelectorService>();
        if (CurrentWindow.Content is FrameworkElement rootElement)
        {
            themeSelector.ApplyTheme(CurrentWindow, rootElement);
        }

        var watcher = Services.GetRequiredService<IFileWatcherService>();
        watcher.StartAll();

        if (CurrentWindow is Window window)
        {
            window.Closed += (s, e) =>
            {
                _autoIndexCts?.Cancel();
                _autoIndexCts?.Dispose();
                _memoryOptimizeCts?.Cancel();
                _memoryOptimizeCts?.Dispose();
                watcher.StopAll();
                var settingsVM = Services.GetService<SettingsViewModel>();
                settingsVM?.Dispose();
                SettingsViewModel.IndexingCompleted -= OnIndexingCompleted;
            };
        }

        var settingsVM = Services.GetRequiredService<SettingsViewModel>();
        if (settingsVM.AutoIndexOnStartup)
        {
            var dirs = settingsVM.WatchedDirectories;
            if (dirs.Count > 0)
            {
                _autoIndexCts = new CancellationTokenSource();
                var token = _autoIndexCts.Token;
                var dispatcher = CurrentWindow?.DispatcherQueue;
                _ = Task.Delay(2000, token).ContinueWith(t =>
                {
                    if (t.IsCanceled || token.IsCancellationRequested)
                        return;
                    dispatcher?.TryEnqueue(() =>
                    {
                        _ = settingsVM.StartIndexingOnPath(dirs[0]);
                    });
                }, token);
            }
        }

        try
        {
            var fileRepository = Services.GetRequiredService<IFileRepository>();
            var anyFile = (await fileRepository.GetAllAsync(1)).Any();
            if (!anyFile)
            {
                await ShowFirstRunWizardAsync();
            }
        }
        catch (Exception ex)
        {
            EmergencyLog($"First run check error: {ex.Message}");
        }
    }

    private async void OnIndexingCompleted(object? sender, EventArgs e)
    {
        // 索引完成后，在 UI 线程刷新首页（刷新文件夹列表和最近文件）
        if (CurrentWindow?.DispatcherQueue != null)
        {
            CurrentWindow.DispatcherQueue.TryEnqueue(async () =>
            {
                if (HomeViewModel != null)
                {
                    await HomeViewModel.RefreshAsync();
                }
            });
        }
    }

    private async Task ShowFirstRunWizardAsync()
    {
        if (_isShowingDialog) return;
        _isShowingDialog = true;

        try
        {
            var fileScanner = Services.GetRequiredService<IFileScanner>();
            var settingsVM = Services.GetRequiredService<SettingsViewModel>();
            var folderPicker = Services.GetRequiredService<IFolderPickerService>();

            if (CurrentWindow?.Content is FrameworkElement frameworkElement)
            {
                if (frameworkElement.XamlRoot == null)
                {
                    var tcs = new TaskCompletionSource();
                    frameworkElement.Loaded += (s, e) => tcs.TrySetResult();
                    await Task.WhenAny(tcs.Task, Task.Delay(1000));
                }

                var wizard = new QuickStartWizard(fileScanner, settingsVM, folderPicker)
                {
                    XamlRoot = frameworkElement.XamlRoot
                };
                await wizard.ShowAsync();
            }
        }
        catch (Exception ex)
        {
            EmergencyLog($"QuickStartWizard error: {ex.Message}");
            var logger = Services.GetService<ISecurityAuditLogger>();
            logger?.LogError("ERR_WIZARD_SHOW", ex.Message);
        }
        finally
        {
            _isShowingDialog = false;
        }
    }
}
