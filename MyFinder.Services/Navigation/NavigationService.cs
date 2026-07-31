using MyFinder.Core.Interfaces;

namespace MyFinder.Services.Navigation;

public class NavigationService : INavigationService
{
    private readonly Dictionary<string, Type> _pages = new();

    public string CurrentPageKey { get; private set; } = string.Empty;

    public event EventHandler<NavigationRequestedEventArgs>? NavigationRequested;
    public event EventHandler? BackRequested;

    public void RegisterPage(string pageKey, Type pageType)
    {
        if (!string.IsNullOrWhiteSpace(pageKey))
        {
            _pages[pageKey] = pageType;
        }
    }

    public Type? GetPageType(string pageKey)
    {
        return _pages.TryGetValue(pageKey, out var pageType) ? pageType : null;
    }

    public bool NavigateTo(string pageKey, object? parameter = null)
    {
        if (!_pages.ContainsKey(pageKey))
        {
            return false;
        }

        CurrentPageKey = pageKey;
        NavigationRequested?.Invoke(this, new NavigationRequestedEventArgs(pageKey, parameter));
        return true;
    }

    public bool GoBack()
    {
        BackRequested?.Invoke(this, EventArgs.Empty);
        return true;
    }
}
