using Jellyfin.Plugin.Blog.Api;
using Xunit;

namespace Jellyfin.Plugin.Blog.Tests;

public class ExcerptCutterTests
{
    [Fact]
    public void ShortText_IsReturnedUntouched()
    {
        var (text, truncated) = ExcerptCutter.Cut("hola mundo", 1500);
        Assert.Equal("hola mundo", text);
        Assert.False(truncated);
    }

    [Fact]
    public void ExactLength_IsNotTruncated()
    {
        var (text, truncated) = ExcerptCutter.Cut(new string('a', 20), 20);
        Assert.Equal(20, text.Length);
        Assert.False(truncated);
    }

    [Fact]
    public void LongText_IsCutAtWordBoundary()
    {
        var (text, truncated) = ExcerptCutter.Cut("uno dos tres cuatro", 10);
        Assert.True(truncated);
        Assert.Equal("uno dos", text);
    }

    [Fact]
    public void CutExactlyBeforeSpace_KeepsWholeWord()
    {
        var (text, truncated) = ExcerptCutter.Cut("uno dos tres", 7);
        Assert.True(truncated);
        Assert.Equal("uno dos", text);
    }

    [Fact]
    public void NoWhitespace_CutsHardAtLimit()
    {
        var (text, truncated) = ExcerptCutter.Cut(new string('x', 50), 10);
        Assert.True(truncated);
        Assert.Equal(new string('x', 10), text);
    }

    [Fact]
    public void NewlineCountsAsWordBoundary()
    {
        var (text, _) = ExcerptCutter.Cut("primera linea\nsegunda linea larga", 20);
        Assert.Equal("primera linea", text);
    }

    [Fact]
    public void HardCut_DoesNotSplitSurrogatePair()
    {
        var s = new string('a', 9) + "\U0001F3AC" + new string('b', 20);
        var (text, truncated) = ExcerptCutter.Cut(s, 10);
        Assert.True(truncated);
        Assert.Equal(new string('a', 9), text);
    }

    [Fact]
    public void DefaultExcerptLength_Is1500()
    {
        var body = string.Join(" ", Enumerable.Repeat("palabra", 400));
        var (text, truncated) = ExcerptCutter.Cut(body, BlogLimits.ExcerptLength);
        Assert.True(truncated);
        Assert.True(text.Length <= 1500);
        Assert.EndsWith("palabra", text);
    }

    [Fact]
    public void SingleLine_CollapsesWhitespaceAndAddsEllipsis()
    {
        var s = ExcerptCutter.SingleLine("hola\n\n  mundo " + new string('x', 200), 20);
        Assert.StartsWith("hola mundo", s);
        Assert.EndsWith("…", s);
        Assert.DoesNotContain("\n", s);
    }

    [Fact]
    public void SingleLine_ShortTextHasNoEllipsis()
    {
        Assert.Equal("ok", ExcerptCutter.SingleLine("  ok ", 120));
    }
}
