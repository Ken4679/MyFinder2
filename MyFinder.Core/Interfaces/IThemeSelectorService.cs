using System.Threading.Tasks;

namespace MyFinder.Core.Interfaces;

public enum AppTheme
{
    Default,
    Light,
    Dark
}

public interface IThemeSelectorService
{
    Task<AppTheme> GetThemeAsync();
    Task SetThemeAsync(AppTheme theme);
    Task InitializeAsync();
    Task SetRequestedThemeAsync();
}
