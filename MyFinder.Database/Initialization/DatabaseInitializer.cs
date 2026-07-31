using Microsoft.Data.Sqlite;
using MyFinder.Core.Interfaces;

namespace MyFinder.Database.Initialization;

public class DatabaseInitializer : IDatabaseInitializer
{
    private readonly IDatabaseContext _databaseContext;
    private readonly ISecurityAuditLogger _logger;

    public DatabaseInitializer(IDatabaseContext databaseContext, ISecurityAuditLogger logger)
    {
        _databaseContext = databaseContext ?? throw new ArgumentNullException(nameof(databaseContext));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    public async Task<bool> InitializeSchemaAsync()
    {
        try
        {
            using var connection = (SqliteConnection)_databaseContext.CreateConnection();
            await connection.OpenAsync();

            using var transaction = connection.BeginTransaction();
            using var command = connection.CreateCommand();
            command.Transaction = transaction;

            command.CommandText = @"
                CREATE TABLE IF NOT EXISTS Files (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    Path TEXT NOT NULL UNIQUE,
                    FileName TEXT NOT NULL,
                    Extension TEXT NOT NULL,
                    SizeBytes INTEGER NOT NULL,
                    Category INTEGER NOT NULL,
                    CreatedTime TEXT NOT NULL,
                    UpdatedTime TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_files_filename ON Files(FileName);
                CREATE INDEX IF NOT EXISTS idx_files_extension ON Files(Extension);
                CREATE INDEX IF NOT EXISTS idx_files_category ON Files(Category);

                CREATE TABLE IF NOT EXISTS Software (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    DisplayName TEXT NOT NULL,
                    Publisher TEXT NOT NULL,
                    Version TEXT NOT NULL,
                    InstallLocation TEXT NOT NULL,
                    MainExePath TEXT NOT NULL UNIQUE,
                    IsSigned INTEGER NOT NULL,
                    SignerName TEXT NOT NULL,
                    CreatedTime TEXT NOT NULL,
                    UpdatedTime TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_software_displayname ON Software(DisplayName);

                CREATE TABLE IF NOT EXISTS Favorites (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    TargetPath TEXT NOT NULL UNIQUE,
                    TargetType INTEGER NOT NULL,
                    DisplayAlias TEXT NOT NULL,
                    CreatedTime TEXT NOT NULL,
                    UpdatedTime TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS SearchHistory (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    QueryText TEXT NOT NULL,
                    SearchType TEXT NOT NULL,
                    CreatedTime TEXT NOT NULL,
                    UpdatedTime TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_search_history_query ON SearchHistory(QueryText);
            ";
            await command.ExecuteNonQueryAsync();

            command.CommandText = @"
                DROP TRIGGER IF EXISTS files_after_insert;
                DROP TRIGGER IF EXISTS files_after_update;
                DROP TRIGGER IF EXISTS files_after_delete;
                DROP TABLE IF EXISTS FilesFTS;
            ";
            await command.ExecuteNonQueryAsync();

            command.CommandText = @"
                CREATE VIRTUAL TABLE FilesFTS USING fts5(
                    FileName,
                    Path,
                    Extension,
                    tokenize='unicode61 remove_diacritics 1',
                    content=Files,
                    content_rowid=Id
                );
            ";
            await command.ExecuteNonQueryAsync();

            command.CommandText = @"
                CREATE TRIGGER files_after_insert AFTER INSERT ON Files
                BEGIN
                    INSERT INTO FilesFTS(rowid, FileName, Path, Extension)
                    VALUES (NEW.Id, NEW.FileName, NEW.Path, NEW.Extension);
                END;

                CREATE TRIGGER files_after_update AFTER UPDATE ON Files
                BEGIN
                    UPDATE FilesFTS
                    SET FileName = NEW.FileName,
                        Path = NEW.Path,
                        Extension = NEW.Extension
                    WHERE rowid = NEW.Id;
                END;

                CREATE TRIGGER files_after_delete AFTER DELETE ON Files
                BEGIN
                    DELETE FROM FilesFTS WHERE rowid = OLD.Id;
                END;
            ";
            await command.ExecuteNonQueryAsync();

            command.CommandText = @"
                SELECT COUNT(*) FROM FilesFTS;
            ";
            var count = Convert.ToInt64(await command.ExecuteScalarAsync());
            if (count == 0)
            {
                command.CommandText = @"
                    INSERT INTO FilesFTS(rowid, FileName, Path, Extension)
                    SELECT Id, FileName, Path, Extension FROM Files;
                ";
                await command.ExecuteNonQueryAsync();
                _logger.LogSecurityEvent("FTS_MIGRATION", "Migrated existing records to FTS table.");
            }

            await transaction.CommitAsync();
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError("ERR_DB_SCHEMA_INIT", $"Failed to create database schema: {ex.Message}");
            return false;
        }
    }
}
