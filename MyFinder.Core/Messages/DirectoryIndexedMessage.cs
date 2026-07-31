namespace MyFinder.Core.Messages;

public class DirectoryIndexedMessage
{
    public string IndexedPath { get; }

    public DirectoryIndexedMessage(string indexedPath)
    {
        IndexedPath = indexedPath;
    }
}
