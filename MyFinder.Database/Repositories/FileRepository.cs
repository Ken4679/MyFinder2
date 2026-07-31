using System.Globalization;
using Microsoft.Data.Sqlite;
using MyFinder.Core.Exceptions;
using MyFinder.Core.Interfaces;
using MyFinder.Core.Interfaces.Repositories;
using MyFinder.Models.Entities;

namespace MyFinder.Database.Repositories;

public class FileRepository : IFileRepository
{
    private readonly IDatabaseContext _databaseContext;

    public FileRepository(IDatabaseContext databaseContext)
    {
        _databaseContext = databaseContext ?? throw new ArgumentNullException(nameof(databaseContext));
    }

    public async Task<long> AddAsync(FileRecord file)
    {
        try
        {
            using var connection = await _databaseContext.OpenConnectionAsync();

            using var command = connection.CreateCommand();
            command.CommandText = @"
                INSERT OR IGNORE INTO Files (Path, FileName, Extension, SizeBytes, Category, CreatedTime, UpdatedTime)
                VALUES (@Path, @FileName, @Extension, @SizeBytes, @Category, @CreatedTime, @UpdatedTime);
                SELECT last_insert_rowid();
            ";

            command.Parameters.AddWithValue("@Path", file.Path);
            command.Parameters.AddWithValue("@FileName", file.FileName);
            command.Parameters.AddWithValue("@Extension", file.Extension);
            command.Parameters.AddWithValue("@SizeBytes", file.SizeBytes);
            command.Parameters.AddWithValue("@Category", file.Category);
            command.Parameters.AddWithValue("@CreatedTime", file.CreatedTime.ToString("o", CultureInfo.InvariantCulture));
            command.Parameters.AddWithValue("@UpdatedTime", file.UpdatedTime.ToString("o", CultureInfo.InvariantCulture));

            var result = await command.ExecuteScalarAsync();
            return result is long id ? id : 0;
        }
        catch (SqliteException ex)
        {
            throw new DataStoreException("SQLite error", "数据库操作失败，请尝试重启软件", ex);
        }
    }

    public async Task AddRangeAsync(IEnumerable<FileRecord> files)
    {
        var fileList = files.ToList();
        if (fileList.Count == 0) return;

        try
        {
            using var connection = await _databaseContext.OpenConnectionAsync();
            using var transaction = connection.BeginTransaction();
            using var command = connection.CreateCommand();
            command.Transaction = transaction;
            command.CommandText = @"
                INSERT OR IGNORE INTO Files (Path, FileName, Extension, SizeBytes, Category, CreatedTime, UpdatedTime)
                VALUES (@Path, @FileName, @Extension, @SizeBytes, @Category, @CreatedTime, @UpdatedTime);
            ";

            var pathParam = command.Parameters.Add("@Path", SqliteType.Text);
            var nameParam = command.Parameters.Add("@FileName", SqliteType.Text);
            var extParam = command.Parameters.Add("@Extension", SqliteType.Text);
            var sizeParam = command.Parameters.Add("@SizeBytes", SqliteType.Integer);
            var catParam = command.Parameters.Add("@Category", SqliteType.Integer);
            var createdParam = command.Parameters.Add("@CreatedTime", SqliteType.Text);
            var updatedParam = command.Parameters.Add("@UpdatedTime", SqliteType.Text);

            foreach (var file in fileList)
            {
                pathParam.Value = file.Path;
                nameParam.Value = file.FileName;
                extParam.Value = file.Extension;
                sizeParam.Value = file.SizeBytes;
                catParam.Value = file.Category;
                createdParam.Value = file.CreatedTime.ToString("o", CultureInfo.InvariantCulture);
                updatedParam.Value = file.UpdatedTime.ToString("o", CultureInfo.InvariantCulture);

                await command.ExecuteNonQueryAsync();
            }

            await transaction.CommitAsync();
        }
        catch (SqliteException ex)
        {
            throw new DataStoreException("SQLite error", "数据库批量写入失败，请尝试重启软件", ex);
        }
    }

    public async Task<FileRecord?> GetByIdAsync(long id)
    {
        try
        {
            using var connection = await _databaseContext.OpenConnectionAsync();

            using var command = connection.CreateCommand();
            command.CommandText = "SELECT Id, Path, FileName, Extension, SizeBytes, Category, CreatedTime, UpdatedTime FROM Files WHERE Id = @Id;";
            command.Parameters.AddWithValue("@Id", id);

            using var reader = await command.ExecuteReaderAsync();
            if (await reader.ReadAsync())
            {
                return MapReaderToFileRecord(reader);
            }

            return null;
        }
        catch (SqliteException ex)
        {
            throw new DataStoreException("SQLite error", "读取数据失败", ex);
        }
    }

    public async Task<FileRecord?> GetByPathAsync(string path)
    {
        try
        {
            using var connection = await _databaseContext.OpenConnectionAsync();

            using var command = connection.CreateCommand();
            command.CommandText = "SELECT Id, Path, FileName, Extension, SizeBytes, Category, CreatedTime, UpdatedTime FROM Files WHERE Path = @Path;";
            command.Parameters.AddWithValue("@Path", path);

            using var reader = await command.ExecuteReaderAsync();
            if (await reader.ReadAsync())
            {
                return MapReaderToFileRecord(reader);
            }

            return null;
        }
        catch (SqliteException ex)
        {
            throw new DataStoreException("SQLite error", "读取数据失败", ex);
        }
    }

    public async Task<IEnumerable<FileRecord>> GetAllAsync(int limit = 100)
    {
        var list = new List<FileRecord>();
        try
        {
            using var connection = await _databaseContext.OpenConnectionAsync();

            using var command = connection.CreateCommand();
            command.CommandText = "SELECT Id, Path, FileName, Extension, SizeBytes, Category, CreatedTime, UpdatedTime FROM Files ORDER BY UpdatedTime DESC LIMIT @Limit;";
            command.Parameters.AddWithValue("@Limit", limit);

            using var reader = await command.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                list.Add(MapReaderToFileRecord(reader));
            }
        }
        catch (SqliteException ex)
        {
            throw new DataStoreException("SQLite error", "读取数据失败", ex);
        }

        return list;
    }

    public async Task<int> GetTotalCountAsync()
    {
        try
        {
            using var connection = await _databaseContext.OpenConnectionAsync();
            using var command = connection.CreateCommand();
            command.CommandText = "SELECT COUNT(1) FROM Files;";
            var result = await command.ExecuteScalarAsync();
            return Convert.ToInt32(result);
        }
        catch
        {
            return 0;
        }
    }

    public async Task<bool> DeleteAsync(long id)
    {
        try
        {
            using var connection = await _databaseContext.OpenConnectionAsync();

            using var command = connection.CreateCommand();
            command.CommandText = "DELETE FROM Files WHERE Id = @Id;";
            command.Parameters.AddWithValue("@Id", id);

            var rows = await command.ExecuteNonQueryAsync();
            return rows > 0;
        }
        catch (SqliteException ex)
        {
            throw new DataStoreException("SQLite error", "删除数据失败", ex);
        }
    }

    public async Task<bool> DeleteByPathAsync(string path)
    {
        try
        {
            using var connection = await _databaseContext.OpenConnectionAsync();

            using var command = connection.CreateCommand();
            command.CommandText = "DELETE FROM Files WHERE Path = @Path;";
            command.Parameters.AddWithValue("@Path", path);

            var rows = await command.ExecuteNonQueryAsync();
            return rows > 0;
        }
        catch (SqliteException ex)
        {
            throw new DataStoreException("SQLite error", "删除数据失败", ex);
        }
    }

    public async Task<bool> UpdateAsync(FileRecord file)
    {
        try
        {
            using var connection = await _databaseContext.OpenConnectionAsync();

            using var command = connection.CreateCommand();
            command.CommandText = @"
                UPDATE Files
                SET FileName = @FileName,
                    Extension = @Extension,
                    SizeBytes = @SizeBytes,
                    Category = @Category,
                    UpdatedTime = @UpdatedTime
                WHERE Path = @Path;
            ";

            command.Parameters.AddWithValue("@FileName", file.FileName);
            command.Parameters.AddWithValue("@Extension", file.Extension);
            command.Parameters.AddWithValue("@SizeBytes", file.SizeBytes);
            command.Parameters.AddWithValue("@Category", file.Category);
            command.Parameters.AddWithValue("@UpdatedTime", file.UpdatedTime.ToString("o", CultureInfo.InvariantCulture));
            command.Parameters.AddWithValue("@Path", file.Path);

            var rows = await command.ExecuteNonQueryAsync();
            return rows > 0;
        }
        catch (SqliteException ex)
        {
            throw new DataStoreException("SQLite error", "更新数据失败", ex);
        }
    }

    private static FileRecord MapReaderToFileRecord(SqliteDataReader reader)
    {
        return new FileRecord
        {
            Id = reader.GetInt64(0),
            Path = reader.GetString(1),
            FileName = reader.GetString(2),
            Extension = reader.GetString(3),
            SizeBytes = reader.GetInt64(4),
            Category = reader.GetInt32(5),
            CreatedTime = DateTime.Parse(reader.GetString(6), CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind),
            UpdatedTime = DateTime.Parse(reader.GetString(7), CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind)
        };
    }
}