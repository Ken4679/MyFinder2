using System.Globalization;
using Microsoft.Data.Sqlite;
using MyFinder.Core.Exceptions;
using MyFinder.Core.Interfaces;
using MyFinder.Core.Interfaces.Repositories;
using MyFinder.Models.Entities;

namespace MyFinder.Database.Repositories;

public class FavoriteRepository : IFavoriteRepository
{
    private readonly IDatabaseContext _databaseContext;

    public FavoriteRepository(IDatabaseContext databaseContext)
    {
        _databaseContext = databaseContext ?? throw new ArgumentNullException(nameof(databaseContext));
    }

    public async Task<long> AddAsync(FavoriteRecord favorite)
    {
        try
        {
            using var connection = await _databaseContext.OpenConnectionAsync();

            using var command = connection.CreateCommand();
            command.CommandText = @"
                INSERT OR IGNORE INTO Favorites (TargetPath, TargetType, DisplayAlias, CreatedTime, UpdatedTime)
                VALUES (@TargetPath, @TargetType, @DisplayAlias, @CreatedTime, @UpdatedTime);
                SELECT last_insert_rowid();
            ";

            command.Parameters.AddWithValue("@TargetPath", favorite.TargetPath);
            command.Parameters.AddWithValue("@TargetType", favorite.TargetType);
            command.Parameters.AddWithValue("@DisplayAlias", favorite.DisplayAlias);
            command.Parameters.AddWithValue("@CreatedTime", favorite.CreatedTime.ToString("o", CultureInfo.InvariantCulture));
            command.Parameters.AddWithValue("@UpdatedTime", favorite.UpdatedTime.ToString("o", CultureInfo.InvariantCulture));

            var result = await command.ExecuteScalarAsync();
            return result is long id ? id : 0;
        }
        catch (SqliteException ex)
        {
            throw new DataStoreException("SQLite error", "添加收藏失败", ex);
        }
    }

    public async Task<IEnumerable<FavoriteRecord>> GetAllAsync()
    {
        var list = new List<FavoriteRecord>();
        try
        {
            using var connection = await _databaseContext.OpenConnectionAsync();

            using var command = connection.CreateCommand();
            command.CommandText = "SELECT Id, TargetPath, TargetType, DisplayAlias, CreatedTime, UpdatedTime FROM Favorites;";

            using var reader = await command.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                list.Add(new FavoriteRecord
                {
                    Id = reader.GetInt64(0),
                    TargetPath = reader.GetString(1),
                    TargetType = reader.GetInt32(2),
                    DisplayAlias = reader.GetString(3),
                    CreatedTime = DateTime.Parse(reader.GetString(4), CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind),
                    UpdatedTime = DateTime.Parse(reader.GetString(5), CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind)
                });
            }
        }
        catch (SqliteException ex)
        {
            throw new DataStoreException("SQLite error", "读取收藏列表失败", ex);
        }

        return list;
    }

    public async Task<bool> DeleteAsync(long id)
    {
        try
        {
            using var connection = await _databaseContext.OpenConnectionAsync();

            using var command = connection.CreateCommand();
            command.CommandText = "DELETE FROM Favorites WHERE Id = @Id;";
            command.Parameters.AddWithValue("@Id", id);

            var rows = await command.ExecuteNonQueryAsync();
            return rows > 0;
        }
        catch (SqliteException ex)
        {
            throw new DataStoreException("SQLite error", "删除收藏失败", ex);
        }
    }

    public async Task<bool> ExistsAsync(string targetPath)
    {
        try
        {
            using var connection = await _databaseContext.OpenConnectionAsync();

            using var command = connection.CreateCommand();
            command.CommandText = "SELECT COUNT(1) FROM Favorites WHERE TargetPath = @TargetPath;";
            command.Parameters.AddWithValue("@TargetPath", targetPath);

            var count = Convert.ToInt64(await command.ExecuteScalarAsync());
            return count > 0;
        }
        catch (SqliteException ex)
        {
            throw new DataStoreException("SQLite error", "查询收藏失败", ex);
        }
    }
}
