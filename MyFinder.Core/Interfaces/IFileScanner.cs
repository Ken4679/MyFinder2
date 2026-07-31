namespace MyFinder.Core.Interfaces;

public interface IFileScanner
{
    Task ScanDirectoryAsync(
        string rootPath,
        CancellationToken cancellationToken = default,
        IProgress<(int Percent, string CurrentFile)>? progress = null,
        bool includeSubdirectories = false);
}
