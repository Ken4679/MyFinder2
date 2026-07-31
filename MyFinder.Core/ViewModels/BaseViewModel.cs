using CommunityToolkit.Mvvm.ComponentModel;

namespace MyFinder.Core.ViewModels;

public abstract partial class BaseViewModel : ObservableObject
{
    [ObservableProperty]
    private bool _isBusy;

    [ObservableProperty]
    private bool _isLoading;

    [ObservableProperty]
    private string _title = string.Empty;

    [ObservableProperty]
    private bool _isInitialized;

    [ObservableProperty]
    private string? _errorMessage;

    [ObservableProperty]
    private bool _hasError;

    public virtual Task InitializeAsync()
    {
        if (IsInitialized) return Task.CompletedTask;
        IsInitialized = true;
        return Task.CompletedTask;
    }

    protected void SetError(string? message)
    {
        ErrorMessage = message;
        HasError = !string.IsNullOrEmpty(message);
    }

    protected void ClearError()
    {
        ErrorMessage = null;
        HasError = false;
    }
}
