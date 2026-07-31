using System.IO;
using MyFinder.Core.Interfaces;

namespace MyFinder.Services;

public class PathProvider : IPathProvider
{
    private readonly string _baseDir;

    public PathProvider()
    {
        // 真正便携模式：直接定位到程序解压后所在的同一根目录 (与 MyFinder.UI.exe 同级)
        _baseDir = AppDomain.CurrentDomain.BaseDirectory;
    }

    public bool IsPortableMode => true;

    public string GetDataRootDirectory()
    {
        return _baseDir;
    }

    public string GetWatchedDirectoriesFilePath()
    {
        return Path.Combine(_baseDir, "watched_dirs.json");
    }

    public string GetLogDirectory()
    {
        var logDir = Path.Combine(_baseDir, "Logs");
        Directory.CreateDirectory(logDir);
        return logDir;
    }

    public Task SetPortableModeAsync(bool enabled)
    {
        // 纯便携模式保持默认启用，直接返回完成 Task
        return Task.CompletedTask;
    }
}
