using MyFinder.Core.Interfaces;
using MyFinder.Models.Enums;

namespace MyFinder.Services.Theme;

public class ThemeService : IThemeService
{
    public ElementThemeMode CurrentTheme { get; private set; } = ElementThemeMode.Default;

    public event EventHandler<ElementThemeMode>? ThemeChanged;

    public void SetTheme(ElementThemeMode theme)
    {
        CurrentTheme = theme;
        ThemeChanged?.Invoke(this, theme);
    }

    public void InitializeTheme()
    {
        SetTheme(ElementThemeMode.Default);
    }
}
