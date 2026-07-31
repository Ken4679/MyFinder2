namespace MyFinder.Core.Interfaces;

public interface IBackupService
{
    Task<bool> BackupDatabaseAsync(string? destinationFolder = null);
    Task<bool> RestoreDatabaseAsync(string backupFilePath);
}
