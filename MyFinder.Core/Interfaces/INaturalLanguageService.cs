namespace MyFinder.Core.Interfaces;

using MyFinder.Models.Entities;

public interface INaturalLanguageService
{
    NaturalLanguageQueryResult ParseQuery(string input);
}
