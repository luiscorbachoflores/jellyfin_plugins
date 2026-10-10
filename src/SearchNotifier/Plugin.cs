using System;
using System.Collections.Generic;
using Jellyfin.Plugin.SearchNotifier.Configuration;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Serialization;

namespace Jellyfin.Plugin.SearchNotifier;

/// <summary>
/// Search Notifier: detects searches made by users (any client), keeps a log and optionally POSTs each one to a webhook.
/// </summary>
public class Plugin : BasePlugin<PluginConfiguration>, IHasWebPages
{
    public Plugin(IApplicationPaths applicationPaths, IXmlSerializer xmlSerializer)
        : base(applicationPaths, xmlSerializer)
    {
        Instance = this;
    }

    public static Plugin? Instance { get; private set; }

    public override string Name => "Search Notifier";

    public override Guid Id => Guid.Parse("8927bd8c-5eeb-4745-90c4-edb2ebd236cc");

    public override string Description => "Registra lo que buscan los usuarios y lo notifica a un webhook configurable.";

    public IEnumerable<PluginPageInfo> GetPages()
    {
        return new[]
        {
            new PluginPageInfo
            {
                Name = Name,
                EmbeddedResourcePath = GetType().Namespace + ".Configuration.configPage.html"
            }
        };
    }
}
