namespace MyFinder.Core.Interfaces;

public interface IFolderPickerService
{
    Task<string> PickFolderAsync(object window);
}
