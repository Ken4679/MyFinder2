namespace MyFinder.Core.Interfaces;

public interface IPathProvider
{
    string GetDataRootDirectory();
    string GetWatchedDirectoriesFilePath();
    string GetLogDirectory();
    bool IsPortableMode { get; }
    Task SetPortableModeAsync(bool enabled);
}
