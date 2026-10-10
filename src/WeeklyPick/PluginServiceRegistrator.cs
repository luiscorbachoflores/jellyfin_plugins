using Jellyfin.Plugin.WeeklyPick.Api;
using Jellyfin.Plugin.WeeklyPick.Web;
using MediaBrowser.Controller;
using MediaBrowser.Controller.Plugins;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;

namespace Jellyfin.Plugin.WeeklyPick;

public class PluginServiceRegistrator : IPluginServiceRegistrator
{
    public void RegisterServices(IServiceCollection serviceCollection, IServerApplicationHost applicationHost)
    {
        serviceCollection.AddSingleton<SeenStore>();
        serviceCollection.AddSingleton<IStartupFilter, WeeklyPickStartupFilter>();
        serviceCollection.AddHostedService<SessionNotifier>();
    }
}
