using Microsoft.UI.Dispatching;
using MyFinder.Core.Interfaces;

namespace MyFinder.UI.Services;

public class DispatcherService : IDispatcherService
{
    public void Enqueue(Action action)
    {
        var dispatcher = App.MainWindow?.DispatcherQueue;
        if (dispatcher != null && !dispatcher.HasThreadAccess)
        {
            dispatcher.TryEnqueue(DispatcherQueuePriority.Normal, () => action());
        }
        else
        {
            action();
        }
    }
}