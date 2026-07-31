using Microsoft.UI.Xaml;
using Windows.Storage;
using Windows.Storage.Pickers;
using MyFinder.Core.Interfaces;

namespace MyFinder.UI.Services;

public class FolderPickerService : IFolderPickerService
{
    public async Task<string> PickFolderAsync(object window)
    {
        try
        {
            var picker = new FolderPicker();
            var win = window as Window ?? throw new ArgumentException("Window must be of type Microsoft.UI.Xaml.Window", nameof(window));
            var hwnd = WinRT.Interop.WindowNative.GetWindowHandle(win);
            WinRT.Interop.InitializeWithWindow.Initialize(picker, hwnd);
            picker.SuggestedStartLocation = PickerLocationId.DocumentsLibrary;

            var result = await picker.PickSingleFolderAsync();
            return result?.Path ?? string.Empty;
        }
        catch (Exception)
        {
            return string.Empty;
        }
    }
}
