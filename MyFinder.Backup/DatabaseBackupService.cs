using Microsoft.Data.Sqlite;
using MyFinder.Core.Interfaces;

namespace MyFinder.Backup;

public class DatabaseBackupService : IBackupService
{
    private readonly IDatabaseContext _databaseContext;
    private readonly ISecurityAuditLogger _logger;

    public DatabaseBackupService(IDatabaseContext databaseContext, ISecurityAuditLogger logger)
    {
        _databaseContext = databaseContext ?? throw new ArgumentNullException(nameof(databaseContext));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    public async Task<bool> BackupDatabaseAsync(string? destinationFolder = null)
    {
        return await Task.Run(async () =>
        {
            try
            {
                var source = _databaseContext.DbPath;
                if (!File.Exists(source))
                {
                    _logger.LogError("BACKUP_FAIL", "Database file not found.");
                    return false;
                }

                using (var conn = await _databaseContext.OpenConnectionAsync())
                {
                    using var cmd = conn.CreateCommand();
                    cmd.CommandText = "PRAGMA wal_checkpoint(TRUNCATE);";
                    await cmd.ExecuteNonQueryAsync();
                }

                var destDir = destinationFolder ?? Path.Combine(Path.GetDirectoryName(source)!, "Backups");
                Directory.CreateDirectory(destDir);
                var dest = Path.Combine(destDir, $"myfinder_backup_{DateTime.Now:yyyyMMdd_HHmmss}.db");
                File.Copy(source, dest, true);
                _logger.LogSecurityEvent("BACKUP_SUCCESS", $"Database backed up to {dest}");
                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError("BACKUP_ERROR", ex.Message);
                return false;
            }
        });
    }

    public async Task<bool> RestoreDatabaseAsync(string backupFilePath)
    {
        return await Task.Run(() =>
        {
            try
            {
                if (!File.Exists(backupFilePath))
                {
                    _logger.LogError("RESTORE_FAIL", "Backup file not found.");
                    return false;
                }

                SqliteConnection.ClearAllPools();
                var target = _databaseContext.DbPath;
                File.Copy(backupFilePath, target, true);
                _logger.LogSecurityEvent("RESTORE_SUCCESS", $"Restored from {backupFilePath}");
                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError("RESTORE_ERROR", ex.Message);
                return false;
            }
        });
    }
}
