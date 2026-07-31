using System.Collections.Concurrent;
using MyFinder.Core.Exceptions;
using MyFinder.Core.Interfaces;
using MyFinder.Core.Interfaces.Repositories;
using MyFinder.Models.Entities;
using MyFinder.Models.Helpers;

namespace MyFinder.Index.FileScanner;

public class FileScanner : IFileScanner
{
    private readonly IFileRepository _fileRepository;
    private readonly ISecurityAuditLogger _logger;

    private static readonly HashSet<string> BlacklistedDirectories = new(StringComparer.OrdinalIgnoreCase)
    {
        @"C:\Windows",
        @"C:\Program Files",
        @"C:\Program Files (x86)",
        @"C:\System Volume Information",
        @"C:\$Recycle.Bin",
        @"C:\Recovery",
        @"C:\Boot",
        @"C:\PerfLogs"
    };

    private static readonly HashSet<string> SkippedExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".tmp", ".log", ".dmp", ".bak", ".cache",
        ".thumb", ".db", ".ldf", ".mdf", ".ndf",
        ".blob", ".bin", ".iso", ".zip", ".rar",
        ".7z", ".gz", ".tar"
    };

    public FileScanner(IFileRepository fileRepository, ISecurityAuditLogger logger)
    {
        _fileRepository = fileRepository ?? throw new ArgumentNullException(nameof(fileRepository));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    private static bool IsBlacklistedDirectory(string path)
    {
        if (string.IsNullOrEmpty(path)) return true;
        var normalized = Path.GetFullPath(path).TrimEnd(Path.DirectorySeparatorChar);
        return BlacklistedDirectories.Any(b => normalized.Equals(b, StringComparison.OrdinalIgnoreCase) || normalized.StartsWith(b + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase));
    }

    public async Task ScanDirectoryAsync(
        string rootPath,
        CancellationToken cancellationToken = default,
        IProgress<(int Percent, string CurrentFile)>? progress = null,
        bool includeSubdirectories = false)
    {
        if (string.IsNullOrEmpty(rootPath) || !Directory.Exists(rootPath))
        {
            _logger.LogError("ERR_SCAN_PATH", $"Invalid or missing root path: {rootPath}");
            progress?.Report((0, "路径无效，请检查"));
            return;
        }

        if (IsBlacklistedDirectory(rootPath))
        {
            _logger.LogError("ERR_SCAN_BLACKLIST", $"Path is blacklisted: {rootPath}");
            progress?.Report((0, "⚠️ 系统敏感目录已被保护，防止影响系统性能"));
            return;
        }

        try
        {
            var options = new EnumerationOptions
            {
                IgnoreInaccessible = true,
                RecurseSubdirectories = includeSubdirectories,
                AttributesToSkip = FileAttributes.Hidden | FileAttributes.System
            };

            _logger.LogSecurityEvent("SCAN_START", $"Starting scan of: {rootPath} (recursive: {includeSubdirectories})");
            progress?.Report((0, "正在扫描..."));

            var allFiles = Directory.EnumerateFiles(rootPath, "*", options)
                .Where(f => !SkippedExtensions.Contains(Path.GetExtension(f)))
                .ToList();

            if (allFiles.Count == 0)
            {
                progress?.Report((100, "没有可索引的文件"));
                _logger.LogSecurityEvent("SCAN_EMPTY", "No files found to index.");
                return;
            }

            const int batchSize = 500;              // 增大批量提交，减少 DB 操作次数
            const int progressReportInterval = 100; // 每 100 个文件才报告一次进度
            long processed = 0;
            long totalFiles = allFiles.Count;

            using var semaphore = new SemaphoreSlim(5); // 降低并发，避免 CPU 过载
            var tasks = new List<Task>();
            var batchRecords = new ConcurrentBag<FileRecord>();

            foreach (var filePath in allFiles)
            {
                if (cancellationToken.IsCancellationRequested)
                {
                    _logger.LogSecurityEvent("SCAN_CANCEL", $"Scan cancelled at {processed} files.");
                    progress?.Report((0, "扫描已取消"));
                    return;
                }

                await semaphore.WaitAsync(cancellationToken);

                var task = Task.Run(async () =>
                {
                    try
                    {
                        var info = new FileInfo(filePath);
                        batchRecords.Add(new FileRecord
                        {
                            Path = info.FullName,
                            FileName = info.Name,
                            Extension = info.Extension.ToLowerInvariant(),
                            SizeBytes = info.Length,
                            Category = FileCategoryHelper.DetermineCategory(info.Extension),
                            CreatedTime = info.CreationTimeUtc,
                            UpdatedTime = info.LastWriteTimeUtc
                        });

                        var current = Interlocked.Increment(ref processed);

                        if (current % batchSize == 0 || current == totalFiles)
                        {
                            var list = batchRecords.ToList();
                            if (list.Count > 0)
                            {
                                await _fileRepository.AddRangeAsync(list);
                                batchRecords.Clear();
                            }
                        }

                        // **限频更新 UI**，仅每 100 个文件更新一次
                        if (current % progressReportInterval == 0 || current == totalFiles)
                        {
                            var percent = (int)((double)current / totalFiles * 100);
                            progress?.Report((percent, $"{current}/{totalFiles} 个文件"));
                        }
                    }
                    catch (Exception ex) when (ex is IOException || ex is UnauthorizedAccessException)
                    {
                        _logger.LogError("ERR_FILE_ACCESS", $"Skipping file: {ex.Message}");
                    }
                    finally
                    {
                        semaphore.Release();
                    }
                }, cancellationToken);

                tasks.Add(task);
            }

            await Task.WhenAll(tasks);

            // 处理剩余记录
            var remaining = batchRecords.ToList();
            if (remaining.Count > 0)
            {
                await _fileRepository.AddRangeAsync(remaining);
            }

            _logger.LogSecurityEvent("SCAN_COMPLETE", $"Total files indexed: {processed}");
            progress?.Report((100, $"索引完成，共 {processed} 个文件"));
        }
        catch (OperationCanceledException)
        {
            _logger.LogSecurityEvent("SCAN_CANCEL", "Scan cancelled by user.");
            progress?.Report((0, "扫描已取消"));
        }
        catch (Exception ex)
        {
            _logger.LogError("ERR_FILE_SCANNER", $"Bulk scan failed: {ex.Message}");
            throw new DataStoreException("索引过程中发生错误", $"索引失败: {ex.Message}", ex);
        }
    }
}