using System.Data;
using Microsoft.Data.Sqlite;
using MyFinder.Core.Interfaces;

namespace MyFinder.Database.Connections;

public class DatabaseContext : IDatabaseContext
{
    private readonly IPathProvider _pathProvider;
    private readonly ISecurityAuditLogger? _logger;

    public string DbPath => Path.Combine(_pathProvider.GetDataRootDirectory(), "myfinder.db");

    public DatabaseContext(IPathProvider pathProvider, ISecurityAuditLogger? logger = null)
    {
        _pathProvider = pathProvider ?? throw new ArgumentNullException(nameof(pathProvider));
        _logger = logger;
        Directory.CreateDirectory(_pathProvider.GetDataRootDirectory());
    }

    public IDbConnection CreateConnection()
    {
        var builder = new SqliteConnectionStringBuilder
        {
            DataSource = DbPath,
            Mode = SqliteOpenMode.ReadWriteCreate,
            Cache = SqliteCacheMode.Shared,
            DefaultTimeout = 30
        };
        return new SqliteConnection(builder.ToString());
    }

    public async Task<SqliteConnection> OpenConnectionAsync()
    {
        var conn = (SqliteConnection)CreateConnection();
        await conn.OpenAsync();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            PRAGMA foreign_keys = ON;
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = NORMAL;
            PRAGMA temp_store = MEMORY;
            PRAGMA cache_size = -10000;
            PRAGMA mmap_size = 268435456;
            PRAGMA page_size = 8192;
            PRAGMA auto_vacuum = 1;
        ";
        await cmd.ExecuteNonQueryAsync();
        return conn;
    }

    public async Task<bool> InitializeDatabaseAsync()
    {
        try
        {
            using var conn = (SqliteConnection)CreateConnection();
            await conn.OpenAsync();
            using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
                PRAGMA journal_mode = WAL;
                PRAGMA synchronous = NORMAL;
                PRAGMA temp_store = MEMORY;
                PRAGMA cache_size = -10000;
                PRAGMA mmap_size = 268435456;
                PRAGMA foreign_keys = ON;
                PRAGMA auto_vacuum = 1;
                PRAGMA page_size = 8192;
            ";
            await cmd.ExecuteNonQueryAsync();
            return true;
        }
        catch (Exception ex)
        {
            _logger?.LogError("ERR_DB_INIT", ex.Message);
            return false;
        }
    }

    public async Task VacuumAndCheckpointAsync()
    {
        try
        {
            using var conn = (SqliteConnection)CreateConnection();
            await conn.OpenAsync();
            using var cmd = conn.CreateCommand();
            cmd.CommandText = "VACUUM;";
            await cmd.ExecuteNonQueryAsync();
            cmd.CommandText = "PRAGMA wal_checkpoint(TRUNCATE);";
            await cmd.ExecuteNonQueryAsync();
            _logger?.LogSecurityEvent("DB_VACUUM", "Database vacuumed and WAL truncated.");
        }
        catch (Exception ex)
        {
            _logger?.LogError("DB_VACUUM_ERROR", ex.Message);
        }
    }
}
