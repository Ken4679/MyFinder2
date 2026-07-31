namespace MyFinder.Core.Interfaces;

public class NavigationRequestedEventArgs : EventArgs
{
    public string PageKey { get; }
    public object? Parameter { get; }

    public NavigationRequestedEventArgs(string pageKey, object? parameter)
    {
        PageKey = pageKey;
        Parameter = parameter;
    }
}

public interface INavigationService
{
    string CurrentPageKey { get; }
    event EventHandler<NavigationRequestedEventArgs>? NavigationRequested;
    event EventHandler? BackRequested;

    void RegisterPage(string pageKey, Type pageType);
    Type? GetPageType(string pageKey);
    bool NavigateTo(string pageKey, object? parameter = null);
    bool GoBack();
}
