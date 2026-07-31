using System.Data;
using Microsoft.Data.Sqlite;

namespace MyFinder.Core.Interfaces;

public interface IDatabaseContext
{
    string DbPath { get; }
    IDbConnection CreateConnection();
    Task<SqliteConnection> OpenConnectionAsync();
    Task<bool> InitializeDatabaseAsync();
    Task VacuumAndCheckpointAsync(); // 新增：用于压缩数据库
}
