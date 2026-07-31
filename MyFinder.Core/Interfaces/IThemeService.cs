using MyFinder.Models.Enums;

namespace MyFinder.Core.Interfaces;

public interface IThemeService
{
    ElementThemeMode CurrentTheme { get; }
    event EventHandler<ElementThemeMode>? ThemeChanged;
    void SetTheme(ElementThemeMode theme);
    void InitializeTheme();
}
