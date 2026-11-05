using System.IO;
using Jellyfin.Plugin.Blog.Db;
using Jellyfin.Plugin.Blog.Web;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Controller;
using MediaBrowser.Controller.Plugins;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;

namespace Jellyfin.Plugin.Blog;

public class PluginServiceRegistrator : IPluginServiceRegistrator
{
    public void RegisterServices(IServiceCollection serviceCollection, IServerApplicationHost applicationHost)
    {
        serviceCollection.AddSingleton(provider =>
        {
            var paths = provider.GetRequiredService<IApplicationPaths>();
            var dir = Path.Combine(paths.PluginsPath, "Blog.Data");
            Directory.CreateDirectory(dir);
            return new BlogRepository(Path.Combine(dir, "blog.db"));
        });

        serviceCollection.AddSingleton<IStartupFilter, BlogStartupFilter>();
    }
}
