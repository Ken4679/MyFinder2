using System;
using System.Threading.Tasks;
using Microsoft.UI.Xaml;
using MyFinder.Core.Interfaces;
using MyFinder.Models.Enums;

namespace MyFinder.UI.Services;

public class ThemeSelectorService : IThemeSelectorService
{
    private readonly IThemeService _themeService;

    public ThemeSelectorService(IThemeService themeService)
    {
        _themeService = themeService ?? throw new ArgumentNullException(nameof(themeService));
        _themeService.ThemeChanged += OnThemeChanged;
    }

    private void OnThemeChanged(object? sender, ElementThemeMode mode)
    {
        ApplyThemeMode(mode);
    }

    public void ApplyThemeMode(ElementThemeMode mode)
    {
        if (App.MainWindow?.Content is FrameworkElement rootElement)
        {
            rootElement.RequestedTheme = mode switch
            {
                ElementThemeMode.Light => ElementTheme.Light,
                ElementThemeMode.Dark => ElementTheme.Dark,
                _ => ElementTheme.Default
            };
        }
    }

    public Task<AppTheme> GetThemeAsync()
    {
        return Task.FromResult(AppTheme.Default);
    }

    public Task SetThemeAsync(AppTheme theme)
    {
        return Task.CompletedTask;
    }

    public Task InitializeAsync()
    {
        ApplyThemeMode(_themeService.CurrentTheme);
        return Task.CompletedTask;
    }

    public Task SetRequestedThemeAsync()
    {
        ApplyThemeMode(_themeService.CurrentTheme);
        return Task.CompletedTask;
    }

    public void ApplyTheme(Window window, FrameworkElement rootElement)
    {
        ApplyThemeMode(_themeService.CurrentTheme);
    }
}
