namespace MyFinder.Core.Interfaces;

public interface IDispatcherService
{
    void Enqueue(Action action);
}