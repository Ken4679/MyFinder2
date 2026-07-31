using System.Globalization;
using Microsoft.Data.Sqlite;
using MyFinder.Core.Exceptions;
using MyFinder.Core.Interfaces;
using MyFinder.Core.Interfaces.Repositories;
using MyFinder.Models.Entities;

namespace MyFinder.Database.Repositories;

public class SoftwareRepository : ISoftwareRepository
{
    private readonly IDatabaseContext _databaseContext;

    public SoftwareRepository(IDatabaseContext databaseContext)
    {
        _databaseContext = databaseContext ?? throw new ArgumentNullException(nameof(databaseContext));
    }

    public async Task<long> AddAsync(SoftwareRecord software)
    {
        try
        {
            using var connection = await _databaseContext.OpenConnectionAsync();

            using var command = connection.CreateCommand();
            command.CommandText = @"
                INSERT OR IGNORE INTO Software (DisplayName, Publisher, Version, InstallLocation, MainExePath, IsSigned, SignerName, CreatedTime, UpdatedTime)
                VALUES (@DisplayName, @Publisher, @Version, @InstallLocation, @MainExePath, @IsSigned, @SignerName, @CreatedTime, @UpdatedTime);
                SELECT last_insert_rowid();
            ";

            command.Parameters.AddWithValue("@DisplayName", software.DisplayName);
            command.Parameters.AddWithValue("@Publisher", software.Publisher);
            command.Parameters.AddWithValue("@Version", software.Version);
            command.Parameters.AddWithValue("@InstallLocation", software.InstallLocation);
            command.Parameters.AddWithValue("@MainExePath", software.MainExePath);
            command.Parameters.AddWithValue("@IsSigned", software.IsSigned ? 1 : 0);
            command.Parameters.AddWithValue("@SignerName", software.SignerName);
            command.Parameters.AddWithValue("@CreatedTime", software.CreatedTime.ToString("o", CultureInfo.InvariantCulture));
            command.Parameters.AddWithValue("@UpdatedTime", software.UpdatedTime.ToString("o", CultureInfo.InvariantCulture));

            var result = await command.ExecuteScalarAsync();
            return result is long id ? id : 0;
        }
        catch (SqliteException ex)
        {
            throw new DataStoreException("SQLite error", "添加软件记录失败", ex);
        }
    }

    public async Task AddRangeAsync(IEnumerable<SoftwareRecord> softwareList)
    {
        var list = softwareList.ToList();
        if (list.Count == 0) return;

        try
        {
            using var connection = await _databaseContext.OpenConnectionAsync();
            using var transaction = connection.BeginTransaction();
            using var command = connection.CreateCommand();
            command.Transaction = transaction;
            command.CommandText = @"
                INSERT OR IGNORE INTO Software (DisplayName, Publisher, Version, InstallLocation, MainExePath, IsSigned, SignerName, CreatedTime, UpdatedTime)
                VALUES (@DisplayName, @Publisher, @Version, @InstallLocation, @MainExePath, @IsSigned, @SignerName, @CreatedTime, @UpdatedTime);
            ";

            var nameParam = command.Parameters.Add("@DisplayName", SqliteType.Text);
            var pubParam = command.Parameters.Add("@Publisher", SqliteType.Text);
            var verParam = command.Parameters.Add("@Version", SqliteType.Text);
            var locParam = command.Parameters.Add("@InstallLocation", SqliteType.Text);
            var exeParam = command.Parameters.Add("@MainExePath", SqliteType.Text);
            var signedParam = command.Parameters.Add("@IsSigned", SqliteType.Integer);
            var signerParam = command.Parameters.Add("@SignerName", SqliteType.Text);
            var createdParam = command.Parameters.Add("@CreatedTime", SqliteType.Text);
            var updatedParam = command.Parameters.Add("@UpdatedTime", SqliteType.Text);

            foreach (var sw in list)
            {
                nameParam.Value = sw.DisplayName;
                pubParam.Value = sw.Publisher;
                verParam.Value = sw.Version;
                locParam.Value = sw.InstallLocation;
                exeParam.Value = sw.MainExePath;
                signedParam.Value = sw.IsSigned ? 1 : 0;
                signerParam.Value = sw.SignerName;
                createdParam.Value = sw.CreatedTime.ToString("o", CultureInfo.InvariantCulture);
                updatedParam.Value = sw.UpdatedTime.ToString("o", CultureInfo.InvariantCulture);

                await command.ExecuteNonQueryAsync();
            }

            await transaction.CommitAsync();
        }
        catch (SqliteException ex)
        {
            throw new DataStoreException("SQLite error", "批量添加软件记录失败", ex);
        }
    }

    public async Task<SoftwareRecord?> GetByIdAsync(long id)
    {
        try
        {
            using var connection = await _databaseContext.OpenConnectionAsync();

            using var command = connection.CreateCommand();
            command.CommandText = "SELECT Id, DisplayName, Publisher, Version, InstallLocation, MainExePath, IsSigned, SignerName, CreatedTime, UpdatedTime FROM Software WHERE Id = @Id;";
            command.Parameters.AddWithValue("@Id", id);

            using var reader = await command.ExecuteReaderAsync();
            if (await reader.ReadAsync())
            {
                return MapReaderToSoftwareRecord(reader);
            }

            return null;
        }
        catch (SqliteException ex)
        {
            throw new DataStoreException("SQLite error", "读取软件记录失败", ex);
        }
    }

    public async Task<IEnumerable<SoftwareRecord>> GetAllAsync()
    {
        var list = new List<SoftwareRecord>();
        try
        {
            using var connection = await _databaseContext.OpenConnectionAsync();

            using var command = connection.CreateCommand();
            command.CommandText = "SELECT Id, DisplayName, Publisher, Version, InstallLocation, MainExePath, IsSigned, SignerName, CreatedTime, UpdatedTime FROM Software;";

            using var reader = await command.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                list.Add(MapReaderToSoftwareRecord(reader));
            }
        }
        catch (SqliteException ex)
        {
            throw new DataStoreException("SQLite error", "读取软件列表失败", ex);
        }

        return list;
    }

    public async Task<bool> DeleteAsync(long id)
    {
        try
        {
            using var connection = await _databaseContext.OpenConnectionAsync();

            using var command = connection.CreateCommand();
            command.CommandText = "DELETE FROM Software WHERE Id = @Id;";
            command.Parameters.AddWithValue("@Id", id);

            var rows = await command.ExecuteNonQueryAsync();
            return rows > 0;
        }
        catch (SqliteException ex)
        {
            throw new DataStoreException("SQLite error", "删除软件记录失败", ex);
        }
    }

    private static SoftwareRecord MapReaderToSoftwareRecord(SqliteDataReader reader)
    {
        return new SoftwareRecord
        {
            Id = reader.GetInt64(0),
            DisplayName = reader.GetString(1),
            Publisher = reader.GetString(2),
            Version = reader.GetString(3),
            InstallLocation = reader.GetString(4),
            MainExePath = reader.GetString(5),
            IsSigned = reader.GetInt32(6) == 1,
            SignerName = reader.GetString(7),
            CreatedTime = DateTime.Parse(reader.GetString(8), CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind),
            UpdatedTime = DateTime.Parse(reader.GetString(9), CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind)
        };
    }
}
