using MyFinder.Models.Entities;

namespace MyFinder.Core.Interfaces;

public interface IFileWatcherService : IDisposable
{
    IReadOnlyList<string> WatchedPaths { get; }

    void AddWatchPath(string path);
    void RemoveWatchPath(string path);
    void StartAll();
    void StopAll();
    bool IsWatching(string path);

    event EventHandler<FileRecord>? FileCreated;
    event EventHandler<FileRecord>? FileChanged;
    event EventHandler<string>? FileDeleted;
    event EventHandler<(string OldPath, string NewPath)>? FileRenamed;
}
