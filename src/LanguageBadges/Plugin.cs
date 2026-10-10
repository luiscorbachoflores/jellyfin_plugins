using System;
using System.Collections.Generic;
using Jellyfin.Plugin.LanguageBadges.Configuration;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Serialization;

namespace Jellyfin.Plugin.LanguageBadges;

/// <summary>
/// Language Badges: paints audio/subtitle language badges (ES, EN, ES/EN...) on posters and detail pages.
/// </summary>
public class Plugin : BasePlugin<PluginConfiguration>, IHasWebPages
{
    public Plugin(IApplicationPaths applicationPaths, IXmlSerializer xmlSerializer)
        : base(applicationPaths, xmlSerializer)
    {
        Instance = this;
    }

    public static Plugin? Instance { get; private set; }

    public override string Name => "Language Badges";

    public override Guid Id => Guid.Parse("56e27219-5a61-4f3b-96c2-e7e2e2076c0a");

    public override string Description => "Muestra los idiomas de audio (y subtitulos) de cada pelicula/episodio sobre el poster y en la ficha.";

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
