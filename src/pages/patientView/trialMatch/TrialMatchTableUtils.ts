import {
    IArmMatch, IClinicalGroupMatch, IDetailedTrialMatch, IGenomicGroupMatch, IGenomicMatch, ITrial,
    ITrialMatch, IArm, IDrug
} from "../../../shared/model/MatchMiner";
import * as _ from 'lodash';

export function groupTrialMatchesById(trials: ITrial[], trialMatches:ITrialMatch[]): IDetailedTrialMatch[] {
    trialMatches = excludeControlArms(trialMatches);
    const matchesGroupedById = _.groupBy(trialMatches, (trial: ITrialMatch) => trial.id);
    const matchedTrials: IDetailedTrialMatch[] = _.map(matchesGroupedById, (trialGroup, trialId) => {
        const originalMatchedTrial: ITrial = _.find( trials, (trial) => trial.id === trialId )!;
        const matchedTrial: IDetailedTrialMatch = {
            id: originalMatchedTrial.id,
            nctId: originalMatchedTrial.nctId,
            protocolNo: originalMatchedTrial.protocolNo,
            phase: originalMatchedTrial.phase,
            shortTitle: originalMatchedTrial.shortTitle,
            status: originalMatchedTrial.status,
            matches: [],
            priority: 0 // highest priority
        };
        matchedTrial.matches = groupTrialMatchesByArmDescription(trialGroup, originalMatchedTrial);
        matchedTrial.priority = calculateTrialPriority(matchedTrial.matches);
        return matchedTrial;
    });
    return _.sortBy(matchedTrials, (trial: IDetailedTrialMatch) => trial.priority);
}

export function groupTrialMatchesByArmDescription(trialGroup: ITrialMatch[], originalMatchedTrial: ITrial): IArmMatch[] {
    const matchesGroupedByArm = _.groupBy(trialGroup, (trial: ITrialMatch) => trial.armDescription);
    const matches = _.map(matchesGroupedByArm, (armGroup, armDescription) => {
        const armMatch: IArmMatch = {
            armDescription: armDescription,
            drugs: [],
            matches: []
        };
        if (!_.isUndefined(originalMatchedTrial.treatmentList.step[0].arm)) {
            armMatch.drugs = getDrugsFromArm(armDescription, originalMatchedTrial.treatmentList.step[0].arm);
        }
        armMatch.matches = groupTrialMatchesByAgeNumerical(armGroup);
        return armMatch;
    });
    return matches;
}

export function groupTrialMatchesByAgeNumerical(armGroup: ITrialMatch[]): IClinicalGroupMatch[] {
    const matchesGroupedByAge = _.groupBy(armGroup, (trial: ITrialMatch) => trial.trialAgeNumerical);
    const matches = _.map(matchesGroupedByAge, (ageGroup, age) => {
        const cancerTypes =  _.uniq(_.map(ageGroup, (trial: ITrialMatch) => trial.trialOncotreePrimaryDiagnosis));
        const positiveCancerTypes: string[] = [];
        const negativeCancerTypes: string[] = [];
        _.map(cancerTypes, (item) => {
            // If a cancer type contains a "!", it means this trial cannot be used for the cancer type, which is a "NOT" match.
            if (item.includes('!')) {
                negativeCancerTypes.push(item.replace('!', ''));
            } else {
                positiveCancerTypes.push(item);
            }
        });
        let clinicalGroupMatch: IClinicalGroupMatch = {
            trialAgeNumerical: age,
            trialOncotreePrimaryDiagnosis: {
                positive: positiveCancerTypes,
                negative: negativeCancerTypes
            },
            matches: [],
            notMatches: []
        };
        const positiveAndNegativeMatches = groupTrialMatchesByGenomicAlteration(matchesGroupedByAge[age]);
        clinicalGroupMatch.matches = positiveAndNegativeMatches.matches;
        clinicalGroupMatch.notMatches = positiveAndNegativeMatches.notMatches;
        return clinicalGroupMatch;
    });
    return matches;
}

export function groupTrialMatchesByGenomicAlteration(ageGroup: ITrialMatch[]) {
    const matchesGroupedByGenomicAlteration = _.groupBy(ageGroup, (trial: ITrialMatch) => trial.genomicAlteration);
    const matches: IGenomicGroupMatch[] = []; // positive matches
    const notMatches: IGenomicGroupMatch[] = []; // negative matches
    _.forEach(matchesGroupedByGenomicAlteration, (genomicAlterationGroup, genomicAlteration) => {
        const genomicGroupMatch = groupTrialMatchesByPatientGenomic(genomicAlterationGroup, genomicAlteration);
        // If a genomic alteration(i.e. BRAF V600E) contains a "!",
        // it means this trial cannot be used for the genomic alteration, which is a "NOT" match.
        if(genomicAlteration.includes('!')) {
            notMatches.push(genomicGroupMatch);
        } else {
            matches.push(genomicGroupMatch);
        }
    });
    return { notMatches: notMatches, matches: matches };
}

export function groupTrialMatchesByPatientGenomic(genomicAlterationGroup: ITrialMatch[], genomicAlteration: string): IGenomicGroupMatch {
    const matchesGroupedByPatientGenomic = _.groupBy(genomicAlterationGroup, (trial: ITrialMatch) => trial.patientGenomic);
    const genomicGroupMatch: IGenomicGroupMatch = {
        genomicAlteration: genomicAlteration,
        matches: []
    };
    genomicGroupMatch.matches = _.map(matchesGroupedByPatientGenomic , (patientGenomicGroup: ITrialMatch[]) => {
        const genomicMatch: IGenomicMatch = {
            trueHugoSymbol: patientGenomicGroup[0].trueHugoSymbol!,
            trueProteinChange: patientGenomicGroup[0].trueProteinChange!,
            sampleIds: _.uniq(_.map(patientGenomicGroup, (trial: ITrialMatch) => trial.sampleId))
        };
        return genomicMatch;
    });
    return genomicGroupMatch;
}

export function calculateTrialPriority(armMatches: IArmMatch[]): number {
    let priority = 0;
    _.forEach(armMatches, (armMatch) => {
        _.forEach(armMatch.matches, (clinicalGroupMatch: IClinicalGroupMatch) => {
            priority += getMatchPriority(clinicalGroupMatch);
        });
    });
    return priority;
}

export function getMatchPriority(clinicalGroupMatch: IClinicalGroupMatch): number {
    // In trial match tab, positive matches should always display before negative matches(notMatches).
    // The highest and default priority is 0. The priority the higher, the display order the lower.
    if (clinicalGroupMatch.notMatches.length > 0) {
        if (clinicalGroupMatch.matches.length === 0) {
            return 2; // A trial only has negative matches.
        }
        return 1; // A trial has both positive matches and negative matches.
    }
    return 0; // A trial only has positive matches.
}

export function excludeControlArms(trialMatches: ITrialMatch[]): ITrialMatch[] {
    const hiddenArmTypes = ['Control Arm', 'Placebo Arm'];
    const filteredTrialMatches: ITrialMatch[] = [];
    _.forEach(trialMatches, (trialMatch) => {
        if ( !trialMatch.armType || !hiddenArmTypes.includes(trialMatch.armType) ) {
            filteredTrialMatches.push(trialMatch);
        }
    });
    return filteredTrialMatches;
}

export function getDrugsFromArm(armDescription: string, arms: IArm[]): string[][] {
    const drugs:string[][] = [];
    if ( armDescription !== '' ) { // match for specific arm
        const matchedArm: IArm = _.find( arms, (arm) => arm.arm_description === armDescription )!;
        if ( !_.isUndefined(matchedArm.drugs) ) {
            drugs.push( _.map( matchedArm.drugs, (drug: IDrug) => drug.name ) );
        }
    }
    return drugs;
}
