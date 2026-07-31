using System.Diagnostics;
using System.Runtime;
using System.Runtime.InteropServices;

namespace MyFinder.UI.Services;

public static class MemoryOptimizer
{
    [DllImport("psapi.dll", SetLastError = true)]
    private static extern bool EmptyWorkingSet(IntPtr hProcess);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool SetProcessWorkingSetSize(IntPtr process, IntPtr minimumWorkingSetSize, IntPtr maximumWorkingSetSize);

    /// <summary>
    /// 强制进行大对象堆压缩，并将物理工作集降至 20~35MB
    /// </summary>
    public static void OptimizeMemory()
    {
        try
        {
            GCSettings.LargeObjectHeapCompactionMode = GCLargeObjectHeapCompactionMode.CompactOnce;
            GC.Collect(2, GCCollectionMode.Forced, blocking: true, compacting: true);
            GC.WaitForPendingFinalizers();

            if (Environment.OSVersion.Platform == PlatformID.Win32NT)
            {
                using var process = Process.GetCurrentProcess();
                SetProcessWorkingSetSize(process.Handle, (IntPtr)(-1), (IntPtr)(-1));
                EmptyWorkingSet(process.Handle);
            }
        }
        catch { }
    }
}
