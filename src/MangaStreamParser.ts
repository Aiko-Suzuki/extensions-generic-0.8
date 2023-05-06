/* eslint-disable linebreak-style */
import {
    Chapter,
    ChapterDetails,
    PartialSourceManga,
    SourceManga,
    Tag,
    TagSection
} from '@paperback/types'

import { convertDate } from './LanguageUtils'

import { HomeSectionData } from './MangaStreamHelper'

import entities = require('entities')

const url = require('simple-url')

export class MangaStreamParser {
    parseMangaDetails($: CheerioStatic, mangaId: string, source: any): SourceManga {
        const titles = []
        titles.push(this.decodeHTMLEntity($('h1.entry-title').text().trim()))

        const altTitles = $(`span:contains(${source.manga_selector_AlternativeTitles}), b:contains(${source.manga_selector_AlternativeTitles})+span, .imptdt:contains(${source.manga_selector_AlternativeTitles}) i, h1.entry-title+span`).contents().remove().last().text().split(',') //Language dependant
        for (const title of altTitles) {
            if (title == '') {
                continue
            }
            titles.push(this.decodeHTMLEntity(title.trim()))
        }

        const author = $(`span:contains(${source.manga_selector_author}), .fmed b:contains(${source.manga_selector_author})+span, .imptdt:contains(${source.manga_selector_author}) i`).contents().remove().last().text().trim() //Language dependant
        const artist = $(`span:contains(${source.manga_selector_artist}), .fmed b:contains(${source.manga_selector_artist})+span, .imptdt:contains(${source.manga_selector_artist}) i`).contents().remove().last().text().trim() //Language dependant
        const image = this.getImageSrc($('img', 'div[itemprop="image"]'))
        const description = this.decodeHTMLEntity($('div[itemprop="description"]').text().trim())

        const arrayTags: Tag[] = []
        for (const tag of $('a', source.manga_tag_selector_box).toArray()) {
            const label = $(tag).text().trim()
            const id = encodeURI($(tag).attr('href')?.replace(`${source.baseUrl}/${source.manga_tag_TraversalPathName}/`, '').replace(/\//g, '') ?? '')
            if (!id || !label) {
                continue
            }
            arrayTags.push({
                id,
                label
            })
        }

        const rawStatus = $(`span:contains(${source.manga_selector_status}), .fmed b:contains(${source.manga_selector_status})+span, .imptdt:contains(${source.manga_selector_status}) i`).contents().remove().last().text().trim()
        let status
        switch (rawStatus.toLowerCase()) {
            case source.manga_StatusTypes.ONGOING.toLowerCase():
                status = 'ONGOING'
                break
            case source.manga_StatusTypes.COMPLETED.toLowerCase():
                status = 'COMPLETED'
                break
            default:
                status = 'ONGOING'
                break
        }

        const tagSections: TagSection[] = [
            App.createTagSection({
                id: '0',
                label: 'genres',
                tags: arrayTags.map((x) => App.createTag(x))
            })
        ]

        return App.createSourceManga({
            id: mangaId,
            mangaInfo: App.createMangaInfo({
                titles,
                image: image || source.fallbackImage,
                status,
                author: author == ''
                        ? 'Unknown'
                        : author,
                artist: artist == ''
                        ? 'Unknown'
                        : artist,
                tags: tagSections,
                desc: description
            })
        })
    }

    parseChapterList($: CheerioSelector, mangaId: string, source: any): Chapter[] {
        const chapters: Chapter[] = []
        let sortingIndex = 0

        // if (mangaId.toUpperCase().endsWith('-RAW') && source.languageCode == 'gb')
        // langCode = LanguageCode.KOREAN

        for (const chapter of $('li', 'div#chapterlist').toArray()) {
            const title = $('span.chapternum', chapter).text().trim()
            const id = this.idCleaner($('a', chapter).attr('href') ?? '')
            const date = convertDate($('span.chapterdate', chapter).text().trim(), source)
            const getNumber = chapter.attribs['data-num'] ?? ''
            const chapterNumberRegex = getNumber.match(/(\d+\.?\d?)+/)
            let chapterNumber = 0
            if (chapterNumberRegex && chapterNumberRegex[1]) {
                chapterNumber = Number(chapterNumberRegex[1])
            }

            if (!id || typeof id === 'undefined') {
                throw new Error(`Could not parse out ID when getting chapters for postId:${mangaId}`)
            }

            chapters.push({
                id,
                langCode: source.language,
                chapNum: chapterNumber,
                name: title,
                time: date,
                sortingIndex,
                volume: 0,
                group: ''
            })
            sortingIndex--
        }

        return chapters.map((chapter) => {
            // @ts-ignore
            chapter.sortingIndex += chapters.length
            return App.createChapter(chapter)
        })
    }

    parseChapterDetails($: CheerioStatic, mangaId: string, chapterId: string): ChapterDetails {
        const data = $.html()

        const pages: string[] = []

        // To avoid our regex capturing more scrips, we stop at the first match of ";", also known as the first ending the matching script.
        let obj: any = /ts_reader.run\((.[^;]+)\)/.exec(data)?.[1] ?? '' // Get the data else return null.
        if (obj == '') {
            throw new Error(`Failed to find page details script for manga ${mangaId}`)
        } // If null, throw error, else parse data to json.

        obj = JSON.parse(obj)

        if (!obj?.sources) {
            throw new Error(`Failed for find sources property for manga ${mangaId}`)
        }

        for (const index of obj.sources) {
            // Check all sources, if empty continue.
            if (index?.images.length == 0) {
                continue
            }

            index.images.map((p: string) => {
                const path: any = url.parse(p, true)
                if (!path.protocol) {
                    path.protocol = 'https'
                }
                p = url.create(path)

                if (this.renderChapterImage(p)) {
                    pages.push(encodeURI(p))
                }
            })
        }

        return App.createChapterDetails({
            id: chapterId,
            mangaId,
            pages
        })
    }

    renderChapterImage(path: string): boolean {
        return true
    }

    parseTags($: CheerioSelector, source: any): TagSection[] {
        const tagSections: any[] = [
            { id: '0', label: 'genres', tags: [] },
            { id: '1', label: 'status', tags: [] },
            { id: '2', label: 'type', tags: [] },
            { id: '3', label: 'order', tags: [] }
        ]

        const sectionDropDowns = $('ul.dropdown-menu.c4.genrez, ul.dropdown-menu.c1').toArray()
        for (let i = 0; i < 4; ++i) {
            const sectionDropdown = sectionDropDowns[i]
            if (!sectionDropdown) {
                continue
            }

            for (const tag of $('li', sectionDropdown).toArray()) {
                const label = $('label', tag).text().trim()
                const id = `${tagSections[i].label}:${$('input', tag).attr('value')}`

                if (!id || !label) {
                    continue
                }

                tagSections[i].tags.push(App.createTag({
                    id,
                    label
                }))
            }
        }

        return tagSections.map((x) => App.createTagSection(x))
    }

    async parseSearchResults($: CheerioSelector, source: any): Promise<any[]> {
        const results: any[] = []

        for (const obj of $('div.bs', 'div.listupd').toArray()) {
            const slug: string = ($('a', obj).attr('href') ?? '').replace(/\/$/, '').split('/').pop() ?? ''
            const path: string = ($('a', obj).attr('href') ?? '').replace(/\/$/, '').split('/').slice(-2).shift() ?? ''
            if (!slug || !path) {
                throw new Error(`Unable to parse slug (${slug}) or path (${path})!`)
            }

            const title: string = $('a', obj).attr('title') ?? ''
            const image = this.getImageSrc($('img', obj))?.split('?resize')[0] ?? ''
            const subtitle = $('div.epxs', obj).text().trim()

            results.push({
                slug,
                path,
                image: image || source.fallbackImage,
                title: this.decodeHTMLEntity(title),
                subtitle: this.decodeHTMLEntity(subtitle)
            })
        }

        return results
    }

    async parseViewMore($: CheerioStatic, source: any): Promise<PartialSourceManga[]> {
        const items: PartialSourceManga[] = []

        for (const manga of $('div.bs', 'div.listupd').toArray()) {
            const title = $('a', manga).attr('title')
            const image = this.getImageSrc($('img', manga))?.split('?resize')[0] ?? ''
            const subtitle = $('div.epxs', manga).text().trim()

            const slug: string = this.idCleaner($('a', manga).attr('href') ?? '')
            const path: string = ($('a', manga).attr('href') ?? '').replace(/\/$/, '').split('/').slice(-2).shift() ?? ''
            const postId = $('a', manga).attr('rel')
            const mangaId: string = source.usePostIds
                                    ? (isNaN(Number(postId))
                                       ? await source.slugToPostId(slug, path)
                                       : postId)
                                    : slug

            if (!mangaId || !title) {
                console.log(`Failed to parse homepage sections for ${source.baseUrl}`)
                continue
            }

            items.push(App.createPartialSourceManga({
                mangaId,
                image: image || source.fallbackImage,
                title: this.decodeHTMLEntity(title),
                subtitle: this.decodeHTMLEntity(subtitle)
            }))
        }

        return items
    }

    async parseHomeSection($: CheerioStatic, section: HomeSectionData, source: any): Promise<PartialSourceManga[]> {
        const items: PartialSourceManga[] = []

        const mangas = section.selectorFunc($)
        if (!mangas.length) {
            console.log(`Unable to parse valid ${section.section.title} section!`)
            return items
        }

        for (const manga of mangas.toArray()) {
            const title = section.titleSelectorFunc($, manga)

            const image = this.getImageSrc($('img', manga))?.split('?resize')[0] ?? ''
            const subtitle = section.subtitleSelectorFunc($, manga) ?? ''

            const slug: string = this.idCleaner($('a', manga).attr('href') ?? '')
            const path: string = ($('a', manga).attr('href') ?? '').replace(/\/$/, '').split('/').slice(-2).shift() ?? ''
            const postId = $('a', manga).attr('rel')
            const mangaId: string = source.usePostIds
                                    ? (isNaN(Number(postId))
                                       ? await source.slugToPostId(slug, path)
                                       : postId)
                                    : slug

            if (!mangaId || !title) {
                console.log(`Failed to parse homepage sections for ${source.baseUrl} title (${title}) mangaId (${mangaId})`)
                continue
            }

            items.push(App.createPartialSourceManga({
                mangaId,
                image: image || source.fallbackImage,
                title: this.decodeHTMLEntity(title),
                subtitle: this.decodeHTMLEntity(subtitle)
            }))
        }

        return items
    }

    isLastPage = ($: CheerioStatic, id: string): boolean => {
        let isLast = true
        if (id == 'view_more') {
            const hasNext = Boolean($('a.r')[0])
            if (hasNext) {
                isLast = false
            }
        }

        if (id == 'search_request') {
            const hasNext = Boolean($('a.next.page-numbers')[0])
            if (hasNext) {
                isLast = false
            }
        }

        return isLast
    }

    protected getImageSrc(imageObj: Cheerio | undefined): string {
        let image: any
        const src = imageObj?.attr('src')
        const dataLazy = imageObj?.attr('data-lazy-src')
        const srcset = imageObj?.attr('srcset')
        const dataSRC = imageObj?.attr('data-src')

        if (typeof src != 'undefined' && !src?.startsWith('data')) {
            image = imageObj?.attr('src')
        } else if (typeof dataLazy != 'undefined' && !dataLazy?.startsWith('data')) {
            image = imageObj?.attr('data-lazy-src')
        } else if (typeof srcset != 'undefined' && !srcset?.startsWith('data')) {
            image = imageObj?.attr('srcset')?.split(' ')[0] ?? ''
        } else if (typeof dataSRC != 'undefined' && !dataSRC?.startsWith('data')) {
            image = imageObj?.attr('data-src')
        } else {
            image = 'https://i.imgur.com/GYUxEX8.png'
        }

        return encodeURI(decodeURI(this.decodeHTMLEntity(image?.trim() ?? '')))
    }

    protected decodeHTMLEntity(str: string): string {
        if (!str) {
            return ''
        }
        return entities.decodeHTML(str)
    }

    protected idCleaner(str: string): string {
        let cleanId: string | null = str
        cleanId = cleanId.replace(/\/$/, '')
        cleanId = cleanId.split('/').pop() ?? null

        if (!cleanId) {
            throw new Error(`Unable to parse id for ${str}`)
        }

        return cleanId
    }
}