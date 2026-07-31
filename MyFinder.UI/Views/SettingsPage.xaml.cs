using System.Diagnostics;
using System.IO;
using System.Reflection;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.UI.Text;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media.Imaging;
using MyFinder.Core.Interfaces;
using MyFinder.Core.ViewModels;
using MyFinder.Models.Enums;
using MyFinder.UI.Common;
using MyFinder.UI.Services;

namespace MyFinder.UI.Views;

public sealed partial class SettingsPage : Page
{
    public SettingsViewModel ViewModel => (SettingsViewModel)DataContext;
    private readonly IFolderPickerService _folderPickerService;
    private readonly IPathProvider _pathProvider;

    public SettingsPage()
    {
        InitializeComponent();
        ViewModelBinder.Bind<SettingsViewModel>(this);
        _folderPickerService = App.Services.GetRequiredService<IFolderPickerService>();
        _pathProvider = App.Services.GetRequiredService<IPathProvider>();

        ViewModel.FolderBrowseRequested += OnFolderBrowseRequested;
        ViewModel.IndexFolderBrowseRequested += OnIndexFolderBrowseRequested;

        Unloaded += OnUnloaded;
    }

    private void OnUnloaded(object sender, RoutedEventArgs e)
    {
        ViewModel.FolderBrowseRequested -= OnFolderBrowseRequested;
        ViewModel.IndexFolderBrowseRequested -= OnIndexFolderBrowseRequested;
        Unloaded -= OnUnloaded;
    }

    private void OnRefreshClick(object sender, RoutedEventArgs e)
    {
        _ = ViewModel.LoadAppDataSizeAsync();
        MemoryOptimizer.OptimizeMemory();
    }

    private async void OnFolderBrowseRequested(object? sender, string path)
    {
        var folder = await _folderPickerService.PickFolderAsync(App.CurrentWindow!);
        if (!string.IsNullOrEmpty(folder))
        {
            ViewModel.AddDirectoryFromPicker(folder);
        }
    }

    private async void OnIndexFolderBrowseRequested(object? sender, string path)
    {
        var folder = await _folderPickerService.PickFolderAsync(App.CurrentWindow!);
        if (!string.IsNullOrEmpty(folder))
        {
            await ViewModel.StartIndexingOnPath(folder);
        }
    }

    private void RadioButtons_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (sender is RadioButtons rb && rb.SelectedIndex >= 0)
        {
            var theme = (ElementThemeMode)rb.SelectedIndex;
            ViewModel.SetThemeCommand.Execute(theme);
        }
    }

    private async void OnHelpClicked(object sender, RoutedEventArgs e)
    {
        await ShowHelpDialogAsync();
    }

    private async Task ShowHelpDialogAsync()
    {
        var dialog = new ContentDialog
        {
            Title = "使用帮助",
            PrimaryButtonText = "我知道了",
            CloseButtonText = "",
            XamlRoot = this.XamlRoot,
            MaxWidth = 600,
            Content = CreateHelpContent()
        };
        await dialog.ShowAsync();
    }

    private UIElement CreateHelpContent()
    {
        var panel = new StackPanel { Spacing = 12 };

        var faqExpander = new Expander
        {
            Header = "📝 常见问题 (FAQ)",
            IsExpanded = true,
            Content = CreateFaqContent()
        };

        var quickStartExpander = new Expander
        {
            Header = "🚀 快速入门",
            Content = CreateQuickStartContent()
        };

        var privacyExpander = new Expander
        {
            Header = "🔒 隐私说明",
            Content = CreatePrivacyContent()
        };

        panel.Children.Add(faqExpander);
        panel.Children.Add(quickStartExpander);
        panel.Children.Add(privacyExpander);

        var scrollViewer = new ScrollViewer
        {
            Content = panel,
            VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
            HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled,
            MaxHeight = 400
        };
        return scrollViewer;
    }

    private UIElement CreateFaqContent()
    {
        var panel = new StackPanel { Spacing = 12 };

        var faqItems = new[]
        {
            ("如何索引文件？", "点击“开始索引（选择目录）”，选择您要搜索的文件夹，等待扫描完成即可。"),
            ("为什么搜索不到我刚下载的文件？", "已索引的目录会被自动实时监控。如果仍搜不到，请确认该目录在“已监控目录列表”中。"),
            ("软件需要联网吗？", "不需要。MyFinder 完全纯本地运行，所有数据保存在本地。"),
            ("什么是 AI 智能搜索？", "在设置中开启 AI 智能搜索助手，可支持自然语言搜索，例如“上周的图片”、“昨天修改的PDF”。")
        };

        foreach (var (q, a) in faqItems)
        {
            var questionBlock = new TextBlock
            {
                Text = "❓ " + q,
                FontWeight = FontWeights.SemiBold,
                Margin = new Thickness(0, 4, 0, 2)
            };
            panel.Children.Add(questionBlock);

            var answerBlock = new TextBlock
            {
                Text = a,
                TextWrapping = TextWrapping.Wrap,
                Margin = new Thickness(16, 0, 0, 4)
            };
            panel.Children.Add(answerBlock);
        }

        return panel;
    }

    private static UIElement CreateQuickStartContent()
    {
        var text = new TextBlock
        {
            Text = """
            1. **首次使用**：点击【设置】→【开始索引（选择目录）】或前往【目录树】浏览
            2. **日常搜索**：在首页搜索框输入关键词，结果即时展示
            3. **智能理解**：在设置中开启 AI 助手，支持自然语言检索
            4. **软件管理**：查看已安装软件及数字签名
            """,
            TextWrapping = TextWrapping.Wrap,
            Margin = new Thickness(12, 0, 0, 0)
        };
        return text;
    }

    private static UIElement CreatePrivacyContent()
    {
        var text = new TextBlock
        {
            Text = """
            • MyFinder 纯本地运行，不收集任何数据
            • 所有索引保存在本地 SQLite 数据库中
            • 日志自动脱敏（用户名替换为 [USER]）
            """,
            TextWrapping = TextWrapping.Wrap,
            Margin = new Thickness(12, 0, 0, 0)
        };
        return text;
    }

    private async void OnAboutClicked(object sender, RoutedEventArgs e)
    {
        await ShowAboutDialogAsync();
    }

    private async Task ShowAboutDialogAsync()
    {
        string version = "v1.0.0.0";
        try
        {
            var assembly = Assembly.GetExecutingAssembly();
            var fileVersion = FileVersionInfo.GetVersionInfo(assembly.Location);
            if (!string.IsNullOrEmpty(fileVersion.FileVersion))
            {
                version = $"v{fileVersion.FileVersion}";
            }
        }
        catch { }

        var contentPanel = new StackPanel
        {
            HorizontalAlignment = HorizontalAlignment.Center,
            Spacing = 12
        };

        UIElement iconElement;
        try
        {
            var iconPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "MyFinder.ico");
            if (File.Exists(iconPath))
            {
                using var icon = new System.Drawing.Icon(iconPath);
                using var bitmap = icon.ToBitmap();
                using var ms = new MemoryStream();
                bitmap.Save(ms, System.Drawing.Imaging.ImageFormat.Png);
                ms.Position = 0;
                var bitmapImage = new BitmapImage();
                await bitmapImage.SetSourceAsync(ms.AsRandomAccessStream());
                iconElement = new Image
                {
                    Source = bitmapImage,
                    Width = 64,
                    Height = 64,
                    HorizontalAlignment = HorizontalAlignment.Center
                };
            }
            else
            {
                iconElement = new FontIcon
                {
                    Glyph = "\uE721",
                    FontSize = 48,
                    HorizontalAlignment = HorizontalAlignment.Center,
                    Foreground = (Microsoft.UI.Xaml.Media.Brush)Application.Current.Resources["AccentFillColorDefaultBrush"]
                };
            }
        }
        catch
        {
            iconElement = new FontIcon
            {
                Glyph = "\uE721",
                FontSize = 48,
                HorizontalAlignment = HorizontalAlignment.Center,
                Foreground = (Microsoft.UI.Xaml.Media.Brush)Application.Current.Resources["AccentFillColorDefaultBrush"]
            };
        }

        contentPanel.Children.Add(iconElement);

        contentPanel.Children.Add(new TextBlock
        {
            Text = "MyFinder",
            FontSize = 22,
            FontWeight = FontWeights.Bold,
            HorizontalAlignment = HorizontalAlignment.Center
        });

        contentPanel.Children.Add(new TextBlock
        {
            Text = version,
            FontSize = 13,
            Foreground = (Microsoft.UI.Xaml.Media.Brush)Application.Current.Resources["TextFillColorSecondaryBrush"],
            HorizontalAlignment = HorizontalAlignment.Center
        });

        contentPanel.Children.Add(new TextBlock
        {
            Text = "轻量、安全、纯本地的 Windows 文件搜索与软件管理工具",
            FontSize = 14,
            TextWrapping = TextWrapping.Wrap,
            HorizontalAlignment = HorizontalAlignment.Center,
            TextAlignment = TextAlignment.Center,
            MaxWidth = 320
        });

        contentPanel.Children.Add(new TextBlock
        {
            Text = $"© {DateTime.Now.Year} MyFinder Contributors",
            FontSize = 12,
            Foreground = (Microsoft.UI.Xaml.Media.Brush)Application.Current.Resources["TextFillColorTertiaryBrush"],
            HorizontalAlignment = HorizontalAlignment.Center
        });

        contentPanel.Children.Add(new TextBlock
        {
            Text = "MIT License",
            FontSize = 12,
            Foreground = (Microsoft.UI.Xaml.Media.Brush)Application.Current.Resources["TextFillColorSecondaryBrush"],
            HorizontalAlignment = HorizontalAlignment.Center
        });

        var dialog = new ContentDialog
        {
            Title = "关于 MyFinder",
            Content = contentPanel,
            CloseButtonText = "确定",
            XamlRoot = this.XamlRoot,
            MinWidth = 380,
            MaxWidth = 420
        };

        await dialog.ShowAsync();
    }
}