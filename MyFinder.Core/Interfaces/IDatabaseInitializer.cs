namespace MyFinder.Core.Interfaces;

public interface IDatabaseInitializer
{
    Task<bool> InitializeSchemaAsync();
}
